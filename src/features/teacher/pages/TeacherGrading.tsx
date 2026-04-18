// src/features/teacher/pages/TeacherGrading.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ensureSeed,
  getAssessments,
  getAttempts,
  getStudentById,
  type AssessmentType,
  type Attempt,
  type MockAssessment,
} from "@/lib/mockStore";

type StatusFilter = "all" | Attempt["status"];

function typeBadge(type: AssessmentType) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusBadge(status: Attempt["status"]) {
  if (status === "published") return "sn-badge sn-badge-green";
  if (status === "graded") return "sn-badge sn-badge-blue";
  if (status === "submitted") return "sn-badge sn-badge-gray";
  return "sn-badge sn-badge-gray"; // in_progress
}

function statusLabel(status: Attempt["status"]) {
  if (status === "in_progress") return "En cours";
  if (status === "submitted") return "À corriger";
  if (status === "graded") return "Corrigé";
  return "Publié";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function orderStatus(s: Attempt["status"]) {
  // priorité: submitted → graded → published → in_progress
  if (s === "submitted") return 0;
  if (s === "graded") return 1;
  if (s === "published") return 2;
  return 9;
}

type Row = {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  type: AssessmentType;
  className: string;

  attemptStatus: Attempt["status"];
  submittedAtISO?: string;

  studentId: string;
  studentName: string;

  // score utile seulement après correction
  score?: string;
};

export default function TeacherGrading() {
  const navigate = useNavigate();

  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshISO, setLastRefreshISO] = useState<string>(() => new Date().toISOString());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("submitted");
  const [query, setQuery] = useState("");

  useEffect(() => {
    ensureSeed();
  }, []);

  // ✅ auto-refresh si un autre écran modifie localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("sn_")) {
        setRefreshKey((k) => k + 1);
        setLastRefreshISO(new Date().toISOString());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { rows, counts } = useMemo(() => {
    const assessments = getAssessments().filter((a) => a.status === "published");

    const assessmentsById: Record<string, MockAssessment> = {};
    for (const a of assessments) assessmentsById[a.id] = a;

    const attempts = getAttempts();

    // cache students
    const studentsById: Record<string, ReturnType<typeof getStudentById>> = {};
    const getStudentCached = (studentId: string) => {
      if (!studentsById[studentId]) studentsById[studentId] = getStudentById(studentId);
      return studentsById[studentId];
    };

    const mapped: Row[] = [];

    for (const at of attempts) {
      const a = assessmentsById[at.assessmentId];
      if (!a) continue;

      const s = getStudentCached(at.studentId);

      // ✅ score: utile surtout quand corrigé/publié
      const score =
        at.status === "graded" || at.status === "published"
          ? at.grading?.finalScore || at.score
          : undefined;

      mapped.push({
        attemptId: at.id,
        assessmentId: a.id,
        assessmentTitle: a.title,
        type: a.type,
        className: a.className,

        attemptStatus: at.status,
        submittedAtISO: at.submittedAtISO,

        studentId: at.studentId,
        studentName: s?.name ?? at.studentId,

        score,
      });
    }

    // counts
    const c: Record<Attempt["status"], number> = {
      in_progress: 0,
      submitted: 0,
      graded: 0,
      published: 0,
    };
    for (const r of mapped) c[r.attemptStatus] += 1;

    // tri robuste
    mapped.sort((a, b) => {
      const w = orderStatus(a.attemptStatus) - orderStatus(b.attemptStatus);
      if (w !== 0) return w;

      const ta = a.submittedAtISO ? new Date(a.submittedAtISO).getTime() : 0;
      const tb = b.submittedAtISO ? new Date(b.submittedAtISO).getTime() : 0;
      return tb - ta;
    });

    return { rows: mapped, counts: c };
  }, [refreshKey]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      if (statusFilter !== "all" && r.attemptStatus !== statusFilter) return false;
      if (!q) return true;

      const hay = `${r.studentName} ${r.studentId} ${r.assessmentTitle} ${r.className}`
        .toLowerCase()
        .trim();

      return hay.includes(q);
    });
  }, [rows, statusFilter, query]);

  const total = counts.submitted + counts.graded + counts.published + counts.in_progress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Corrections</div>
          <div className="text-sm text-gray-500">
            Copies soumises → corriger → publier.
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Dernière mise à jour : {formatDate(lastRefreshISO)}
          </div>
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => {
            setRefreshKey((k) => k + 1);
            setLastRefreshISO(new Date().toISOString());
          }}
          type="button"
        >
          ↻ Rafraîchir
        </button>
      </div>

      {/* KPI + Filters */}
      <div className="sn-card p-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="text-xs text-gray-600">À corriger</div>
            <div className="text-lg font-bold text-gray-900">📝 {counts.submitted}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="text-xs text-gray-600">Corrigées</div>
            <div className="text-lg font-bold text-gray-900">✅ {counts.graded}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="text-xs text-gray-600">Publiées</div>
            <div className="text-lg font-bold text-gray-900">📣 {counts.published}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="text-xs text-gray-600">Total</div>
            <div className="text-lg font-bold text-gray-900">{total}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full sm:w-80 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Rechercher (élève, éval, classe)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <button
              className={`sn-btn-ghost sn-press ${statusFilter === "all" ? "ring-2 ring-blue-200" : ""}`}
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              Tous
            </button>

            <button
              className={`sn-btn-ghost sn-press ${statusFilter === "submitted" ? "ring-2 ring-blue-200" : ""}`}
              onClick={() => setStatusFilter("submitted")}
              type="button"
            >
              À corriger ({counts.submitted})
            </button>

            <button
              className={`sn-btn-ghost sn-press ${statusFilter === "graded" ? "ring-2 ring-blue-200" : ""}`}
              onClick={() => setStatusFilter("graded")}
              type="button"
            >
              Corrigé ({counts.graded})
            </button>

            <button
              className={`sn-btn-ghost sn-press ${statusFilter === "published" ? "ring-2 ring-blue-200" : ""}`}
              onClick={() => setStatusFilter("published")}
              type="button"
            >
              Publié ({counts.published})
            </button>

            {/* optionnel : si tu veux le montrer */}
            {/* 
            <button
              className={`sn-btn-ghost sn-press ${statusFilter === "in_progress" ? "ring-2 ring-blue-200" : ""}`}
              onClick={() => setStatusFilter("in_progress")}
              type="button"
            >
              En cours ({counts.in_progress})
            </button>
            */}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredRows.map((r) => {
          const primaryLabel = r.attemptStatus === "submitted" ? "Corriger" : "Ouvrir";

          return (
            <div key={r.attemptId} className="sn-card sn-card-hover p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-gray-900">{r.studentName}</div>
                    <span className="sn-badge sn-badge-gray">{r.className}</span>
                    <span className={typeBadge(r.type)}>{r.type}</span>
                    <span className={statusBadge(r.attemptStatus)}>{statusLabel(r.attemptStatus)}</span>
                  </div>

                  <div className="mt-1 text-sm text-gray-500">{r.assessmentTitle}</div>

                  <div className="mt-1 text-xs text-gray-500">
                    Soumis : {formatDate(r.submittedAtISO)}
                  </div>
                </div>

                {r.score && <span className="sn-badge sn-badge-green">{r.score}</span>}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="sn-btn-primary sn-press"
                  onClick={() =>
                    navigate(
                      `/app/teacher/grading/${r.assessmentId}?studentId=${encodeURIComponent(r.studentId)}`
                    )
                  }
                  type="button"
                >
                  {primaryLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRows.length === 0 && (
        <div className="sn-card p-6 text-sm text-gray-600">
          Aucune copie trouvée. Fais soumettre une évaluation côté apprenant (démo), ou change le filtre.
        </div>
      )}
    </div>
  );
}
