import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

type AssessmentType = "Quiz" | "Devoir" | "Examen";

type Course = {
  id: string;
  title: string;
  classes: { id: string; name: string }[];
  sections: { id: string; title: string }[];
};

export default function TeacherAssessmentCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const courses: Course[] = useMemo(
    () => [
      {
        id: "math6b",
        title: "Maths — 6e B",
        classes: [{ id: "6b", name: "6e B" }],
        sections: [
          { id: "c1", title: "Chapitre 1 — Nombres entiers" },
          { id: "c2", title: "Chapitre 2 — Fractions" },
        ],
      },
      {
        id: "math5a",
        title: "Maths — 5e A",
        classes: [{ id: "5a", name: "5e A" }],
        sections: [
          { id: "c1", title: "Chapitre 1 — Calcul littéral" },
          { id: "c2", title: "Chapitre 2 — Proportions" },
        ],
      },
      {
        id: "sci6b",
        title: "Sciences — 6e B",
        classes: [{ id: "6b", name: "6e B" }],
        sections: [
          { id: "c1", title: "Chapitre 1 — Matière" },
          { id: "c2", title: "Chapitre 2 — Énergie" },
        ],
      },
    ],
    []
  );

  // ---- Prefill depuis l'URL: ?course=...&section=...
  const prefillCourse = searchParams.get("course") || "";
  const prefillSection = searchParams.get("section") || "";

  const initialCourseId = courses.some((c) => c.id === prefillCourse)
    ? prefillCourse
    : courses[0].id;

  const initialCourse = courses.find((c) => c.id === initialCourseId)!;

  const initialSectionId = initialCourse.sections.some((s) => s.id === prefillSection)
    ? prefillSection
    : initialCourse.sections[0]?.id || "";

  // ---- State
  const [type, setType] = useState<AssessmentType>("Quiz");
  const [courseId, setCourseId] = useState(initialCourseId);
  const activeCourse = courses.find((c) => c.id === courseId)!;

  const [sectionId, setSectionId] = useState(initialSectionId);
  const activeSection =
    activeCourse.sections.find((s) => s.id === sectionId) || activeCourse.sections[0];

  const className = activeCourse.classes[0]?.name || "—";

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(30);
  const [totalPoints, setTotalPoints] = useState(20);
  const [instructions, setInstructions] = useState("");

  const isExam = type === "Examen";
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  function onCourseChange(nextCourseId: string) {
    setCourseId(nextCourseId);
    const nextCourse = courses.find((c) => c.id === nextCourseId)!;
    setSectionId(nextCourse.sections[0]?.id || "");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();

    alert(
      `✅ Évaluation créée (démo)\n\nType: ${type}\nTitre: ${
        title || "(sans titre)"
      }\nCours: ${activeCourse.title}\nSection: ${
        activeSection?.title || "(non définie)"
      }\nClasse: ${className}\nDate: ${date || "(non définie)"}`
    );

    navigate("/app/teacher/assessments");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Créer une évaluation</div>
          <div className="text-sm text-gray-500">
            Liez l’évaluation à un cours et un chapitre pour un workflow complet.
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)} type="button">
          ← Retour
        </button>
      </div>

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        {/* Col gauche */}
        <div className="sn-card p-5 space-y-4 lg:col-span-2">
          {/* Type */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-gray-800">Type</div>
            <div className="flex flex-wrap gap-2">
              <TypePill label="Quiz" active={type === "Quiz"} onClick={() => setType("Quiz")} />
              <TypePill label="Devoir" active={type === "Devoir"} onClick={() => setType("Devoir")} />
              <TypePill label="Examen" active={type === "Examen"} onClick={() => setType("Examen")} tone="danger" />
            </div>
          </div>

          {/* Liaison cours + section */}
          <div className="sn-card p-4 bg-gray-50 border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900">Liaison</div>
              <span className="sn-badge sn-badge-blue">Cours</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cours</label>
                <select
                  className="sn-input"
                  value={courseId}
                  onChange={(e) => onCourseChange(e.target.value)}
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Chapitre / Section</label>
                <select
                  className="sn-input"
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                >
                  {activeCourse.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Classe associée automatiquement :{" "}
              <span className="font-semibold text-gray-800">{className}</span>
            </div>
          </div>

          {/* Titre */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Titre</label>
            <input
              className="sn-input"
              placeholder="ex : Devoir — Exercices Fractions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Date + durée */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Date / heure</label>
              <input
                className="sn-input"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Durée (minutes)</label>
              <input
                className="sn-input"
                type="number"
                min={5}
                max={240}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Points */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Note totale</label>
            <input
              className="sn-input"
              type="number"
              min={1}
              max={200}
              value={totalPoints}
              onChange={(e) => setTotalPoints(Number(e.target.value))}
            />
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Consignes</label>
            <textarea
              className="sn-input"
              style={{ minHeight: 110 }}
              placeholder="Donnez les consignes aux apprenants..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          {/* Examen options */}
          {isExam && (
            <div className="sn-card p-4 bg-red-50/40 ring-1 ring-red-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">Options Examen</div>
                <span className="sn-badge sn-badge-red">Examen</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Fenêtre de passage (min)
                  </label>
                  <input
                    className="sn-input"
                    type="number"
                    min={15}
                    max={720}
                    value={windowMinutes}
                    onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Mélanger questions</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">
                      Activer le mélange pour limiter la copie.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex flex-wrap gap-2">
            <button type="submit" className="sn-btn-primary sn-press">
              Créer (démo)
            </button>
            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={() => navigate("/app/teacher/assessments")}
            >
              Annuler
            </button>
          </div>
        </div>

        {/* Résumé */}
        <div className="sn-card sn-card-hover p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Résumé</div>
            <span
              className={
                type === "Examen"
                  ? "sn-badge sn-badge-red"
                  : type === "Devoir"
                  ? "sn-badge sn-badge-blue"
                  : "sn-badge sn-badge-gray"
              }
            >
              {type}
            </span>
          </div>

          <SummaryRow label="Cours" value={activeCourse.title} />
          <SummaryRow label="Section" value={activeSection?.title || "—"} />
          <SummaryRow label="Classe" value={className} />
          <SummaryRow label="Titre" value={title || "—"} />
          <SummaryRow label="Date" value={date ? formatDateTime(date) : "—"} />
          <SummaryRow label="Durée" value={`${duration} min`} />
          <SummaryRow label="Note" value={`${totalPoints} pts`} />

          {isExam && (
            <div className="pt-2 space-y-2">
              <div className="text-sm font-semibold text-gray-800">Spécifique Examen</div>
              <SummaryRow label="Fenêtre" value={`${windowMinutes} min`} />
              <SummaryRow label="Mélange" value={shuffleQuestions ? "Activé" : "Désactivé"} />
            </div>
          )}

          <div className="pt-2 text-xs text-gray-500">
            *Mode démo : la sauvegarde réelle viendra avec la base de données.*
          </div>
        </div>
      </form>
    </div>
  );
}

function TypePill({
  label,
  active,
  onClick,
  tone,
}: {
  label: "Quiz" | "Devoir" | "Examen";
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
  const activeCls =
    tone === "danger" ? "bg-red-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm";
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-900 text-right">{value}</div>
    </div>
  );
}

function formatDateTime(v: string) {
  const [date, time] = v.split("T");
  return `${date} • ${time}`;
}
