import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssessmentType, MockAssessment } from "@/lib/mockStore";
import { ensureSeed, getAssessments, updateAssessment } from "@/lib/mockStore";

export default function TeacherAssessments() {
  const navigate = useNavigate();

  const [filter, setFilter] = useState<"Tous" | AssessmentType>("Tous");
  const [rows, setRows] = useState<MockAssessment[]>([]);

  useEffect(() => {
    ensureSeed();
    setRows(getAssessments());
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((a) => (filter === "Tous" ? true : a.type === filter));
  }, [rows, filter]);

  function typeBadge(type: AssessmentType) {
    if (type === "Examen") return "sn-badge sn-badge-red";
    if (type === "Devoir") return "sn-badge sn-badge-blue";
    return "sn-badge sn-badge-gray";
  }

  function statusBadge(status: MockAssessment["status"]) {
    return status === "Publié" ? "sn-badge sn-badge-green" : "sn-badge sn-badge-gray";
  }

  function togglePublish(a: MockAssessment) {
    const nextStatus = a.status === "Publié" ? "Brouillon" : "Publié";
    const next = updateAssessment(a.id, { status: nextStatus, isNew: nextStatus === "Publié" });
    setRows(next);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Évaluations</div>
          <div className="text-sm text-gray-500">
            Publiez pour rendre visible côté apprenant.
          </div>
        </div>

        <button className="sn-btn-primary sn-press" onClick={() => navigate("/app/teacher/assessments/new")}>
          + Créer
        </button>
      </div>

      <div className="sn-card p-3 flex flex-wrap items-center gap-2">
        <Pill label="Tous" active={filter === "Tous"} onClick={() => setFilter("Tous")} />
        <Pill label="Quiz" active={filter === "Quiz"} onClick={() => setFilter("Quiz")} />
        <Pill label="Devoir" active={filter === "Devoir"} onClick={() => setFilter("Devoir")} />
        <Pill label="Examen" active={filter === "Examen"} onClick={() => setFilter("Examen")} tone="danger" />
      </div>

      <div className="space-y-3">
        {filtered.map((a) => (
          <div key={a.id} className="sn-card sn-card-hover p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-gray-900">{a.title}</div>
                  <span className={typeBadge(a.type)}>{a.type}</span>
                  {a.isNew && a.status === "Publié" && (
                    <span className="sn-badge sn-badge-blue">Nouveau</span>
                  )}
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {a.courseTitle} • {a.sectionTitle}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {a.className} • {a.when}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className={statusBadge(a.status)}>{a.status}</span>
                <button className="sn-btn-ghost sn-press" onClick={() => alert("Ouvrir (démo)")}>
                  Ouvrir
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="sn-btn-ghost sn-press" onClick={() => alert("Modifier (démo)")}>
                Modifier
              </button>

              <button className="sn-btn-ghost sn-press" onClick={() => togglePublish(a)}>
                {a.status === "Publié" ? "Dépublier" : "Publier"}
              </button>

              <button className="sn-btn-primary sn-press" onClick={() => (window.location.href = "/app/teacher/grading")}>
                Corrections
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        *Mode démo : publication enregistrée dans localStorage.*
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
    <button type="button" onClick={onClick} className={`${base} ${active ? activeCls : inactiveCls}`}>
      {label}
    </button>
  );
}
