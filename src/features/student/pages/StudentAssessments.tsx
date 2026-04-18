import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ensureSeed,
  getAttemptFor,
  getPublishedAssessments,
  type AssessmentType,
  type MockAssessment,
} from "@/lib/mockStore";

type StudentStatus = "À faire" | "Terminé";

type Row = MockAssessment & {
  studentStatus: StudentStatus;
  scoreLabel?: string;
};

export default function StudentAssessments() {
  const navigate = useNavigate();
  const studentId = "demo-student";

  const [filter, setFilter] = useState<"Tous" | AssessmentType>("Tous");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    ensureSeed();
    const published = getPublishedAssessments();

    const mapped: Row[] = published.map((a) => {
      const attempt = getAttemptFor(a.id, studentId);
      const done = Boolean(attempt);

      return {
        ...a,
        studentStatus: done ? "Terminé" : "À faire",
        // Sécurise le type (string) même si attempt.score est un number
        scoreLabel:
          attempt?.score !== undefined && attempt?.score !== null
            ? String(attempt.score)
            : undefined,
      };
    });

    setRows(mapped);
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((a) => (filter === "Tous" ? true : a.type === filter));
  }, [rows, filter]);

  const typeBadgeClass = (type: AssessmentType) => {
    if (type === "Examen") return "sn-badge sn-badge-red";
    if (type === "Devoir") return "sn-badge sn-badge-blue";
    return "sn-badge sn-badge-gray";
  };

  const statusBadgeClass = (s: StudentStatus) => {
    return s === "Terminé"
      ? "sn-badge sn-badge-green"
      : "sn-badge sn-badge-gray";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Mes évaluations</div>
          <div className="text-sm text-gray-500">
            Seules les évaluations publiées sont visibles.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill
            label="Tous"
            active={filter === "Tous"}
            onClick={() => setFilter("Tous")}
          />
          <Pill
            label="Quiz"
            active={filter === "Quiz"}
            onClick={() => setFilter("Quiz")}
          />
          <Pill
            label="Devoir"
            active={filter === "Devoir"}
            onClick={() => setFilter("Devoir")}
          />
          <Pill
            label="Examen"
            active={filter === "Examen"}
            onClick={() => setFilter("Examen")}
            tone="danger"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((a) => (
          <div key={a.id} className="sn-card sn-card-hover p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-gray-900">{a.title}</div>

                  {a.isNew && (
                    <span className="sn-badge sn-badge-blue">Nouveau</span>
                  )}

                  <span className={typeBadgeClass(a.type)}>{a.type}</span>
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {a.courseTitle} • {a.sectionTitle}
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {a.className} • {a.when}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={statusBadgeClass(a.studentStatus)}>
                  {a.studentStatus}
                </span>

                {a.studentStatus === "Terminé" && a.scoreLabel && (
                  <span className="sn-badge sn-badge-green">{a.scoreLabel}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                {a.studentStatus === "Terminé"
                  ? "Soumis. En attente ou corrigé selon le type."
                  : "Prêt ? Tu peux commencer."}
              </div>

              <div className="flex gap-2">
                {a.studentStatus === "À faire" ? (
                  <button
                    className="sn-btn-primary sn-press"
                    onClick={() => navigate(`/app/student/assessments/${a.id}`)}
                  >
                    Commencer
                  </button>
                ) : (
                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={() => navigate(`/app/student/assessments/${a.id}/result`)}
                  >
                    Voir résultat
                  </button>
                )}

                <button
                  className="sn-btn-ghost sn-press"
                  onClick={() => alert("Détails (démo)")}
                >
                  Détails
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        *Astuce : publie/dépublie côté enseignant pour voir la liste évoluer.*
      </div>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
  const activeCls = tone === "danger" ? "bg-red-600 text-white" : "bg-blue-600 text-white";
  const inactiveCls =
    tone === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {label}
    </button>
  );
}
