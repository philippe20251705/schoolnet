import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type Section = {
  id: string;
  title: string;
  items: { id: string; type: "PDF" | "Vidéo" | "Lien"; label: string }[];
};

type Assessment = {
  id: string;
  type: "Quiz" | "Devoir" | "Examen";
  title: string;
  className: string;
  when: string;
  status: "Brouillon" | "Publié";
};

export default function TeacherCourseDetail() {
  const navigate = useNavigate();
  const { courseId } = useParams();

  const course = useMemo(() => {
    // Démo : on mappe un titre selon courseId
    const map: Record<string, string> = {
      math6b: "Maths — 6e B",
      math5a: "Maths — 5e A",
      sci6b: "Sciences — 6e B",
    };
    return {
      id: courseId || "math6b",
      title: map[courseId || "math6b"] || "Cours",
      subtitle: "Plan de cours, ressources et évaluations liées",
    };
  }, [courseId]);

  const [sections, setSections] = useState<Section[]>(
    useMemo(
      () => [
        {
          id: "s1",
          title: "Chapitre 1 — Nombres entiers",
          items: [
            { id: "i1", type: "PDF", label: "Cours (PDF)" },
            { id: "i2", type: "Vidéo", label: "Vidéo explicative" },
          ],
        },
        {
          id: "s2",
          title: "Chapitre 2 — Fractions",
          items: [{ id: "i3", type: "Lien", label: "Exercices en ligne" }],
        },
      ],
      []
    )
  );

  const [assessments] = useState<Assessment[]>(
    useMemo(
      () => [
        {
          id: "a1",
          type: "Quiz",
          title: "Quiz — Chapitre 1",
          className: "6e B",
          when: "Aujourd’hui",
          status: "Publié",
        },
        {
          id: "a2",
          type: "Devoir",
          title: "Devoir — Exercices Fractions",
          className: "6e B",
          when: "À rendre mardi",
          status: "Brouillon",
        },
        {
          id: "a3",
          type: "Examen",
          title: "Examen — Trimestre 1",
          className: "6e B",
          when: "Jeudi 10:00",
          status: "Publié",
        },
      ],
      []
    )
  );

  function addSection() {
    const next = {
      id: `s${sections.length + 1}`,
      title: `Nouvelle section ${sections.length + 1}`,
      items: [],
    };
    setSections((prev) => [next, ...prev]);
  }

  function badgeClass(t: "Quiz" | "Devoir" | "Examen") {
    if (t === "Examen") return "sn-badge sn-badge-red";
    if (t === "Devoir") return "sn-badge sn-badge-blue";
    return "sn-badge sn-badge-gray";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{course.title}</div>
          <div className="text-sm text-gray-500">{course.subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)}>
            ← Retour
          </button>
          <button
            className="sn-btn-ghost sn-press"
            onClick={() => alert("Paramètres (démo)")}
          >
            Paramètres
          </button>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="sn-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          Actions rapides : ajoute des ressources ou crée une évaluation liée au
          cours.
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="sn-btn-ghost sn-press" onClick={addSection}>
            + Ajouter une section
          </button>
          <button
            className="sn-btn-primary sn-press"
            onClick={() =>
              navigate(`/app/teacher/assessments/new?course=${course.id}`)
            }
          >
            + Créer une évaluation
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sections */}
        <div className="lg:col-span-2 space-y-4">
          <div className="sn-card p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Sections / Chapitres</div>
              <span className="sn-badge sn-badge-gray">
                {sections.length} sections
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {sections.map((s) => (
                <div key={s.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{s.title}</div>
                      <div className="text-sm text-gray-500">
                        {s.items.length} ressource(s)
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="sn-btn-ghost sn-press"
                        type="button"
                        onClick={() => alert("Ajouter ressource (démo)")}
                      >
                        + Ressource
                      </button>

                      <button
                        className="sn-btn-primary sn-press"
                        type="button"
                        onClick={() =>
                          navigate(
                            `/app/teacher/assessments/new?course=${course.id}&section=${s.id}`
                          )
                        }
                      >
                        + Évaluation
                      </button>
                    </div>
                  </div>

                  {s.items.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {s.items.map((it) => (
                        <div
                          key={it.id}
                          className="rounded-2xl bg-gray-50 border border-gray-100 p-3 flex items-center justify-between"
                        >
                          <div className="text-sm text-gray-800">
                            <span className="font-semibold">{it.type}</span>{" "}
                            <span className="text-gray-600">— {it.label}</span>
                          </div>
                          <button
                            className="sn-btn-ghost sn-press"
                            type="button"
                            onClick={() => alert("Ouvrir ressource (démo)")}
                          >
                            Ouvrir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Évaluations liées */}
        <div className="space-y-4">
          <div className="sn-card sn-card-hover p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Évaluations liées</div>
              <button
                className="sn-btn-ghost sn-press"
                onClick={() => navigate("/app/teacher/assessments")}
              >
                Voir tout
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {assessments.map((a) => (
                <div key={a.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{a.title}</div>
                      <div className="text-sm text-gray-500">
                        {a.className} • {a.when}
                      </div>
                    </div>
                    <span className={badgeClass(a.type)}>{a.type}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={
                        a.status === "Publié"
                          ? "sn-badge sn-badge-green"
                          : "sn-badge sn-badge-gray"
                      }
                    >
                      {a.status}
                    </span>

                    <div className="flex gap-2">
                      <button
                        className="sn-btn-ghost sn-press"
                        type="button"
                        onClick={() => navigate("/app/teacher/grading")}
                      >
                        Corrections
                      </button>
                      <button
                        className="sn-btn-primary sn-press"
                        type="button"
                        onClick={() => alert("Ouvrir évaluation (démo)")}
                      >
                        Ouvrir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <button
                className="sn-btn-primary w-full sn-press"
                onClick={() =>
                  navigate(`/app/teacher/assessments/new?course=${course.id}`)
                }
              >
                + Créer une évaluation
              </button>
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="font-semibold">Aperçu</div>
            <div className="mt-2 text-sm text-gray-500">
              À terme, cette zone affichera :
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Progression moyenne</li>
                <li>Dernières activités</li>
                <li>Alertes (copies en retard)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
