import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ensureSeed,
  getAssessmentById,
  getAttemptFor,
  type AssessmentType,
  type Attempt,
} from "@/lib/mockStore";

type Question =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      choices: string[];
      correct: string; // démo (auto-correction quiz)
      points: number;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      points: number;
    };

// ✅ doit matcher mockStore.Grading (pending|graded|published)
type TeacherGrading = NonNullable<Attempt["grading"]>;

function badgeTypeClass(type: AssessmentType) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function parseScore(score?: string | number | null) {
  if (score === undefined || score === null) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) {
    const got = Number(m[1]);
    const max = Number(m[2]);
    if (Number.isFinite(got) && Number.isFinite(max) && max > 0) {
      return { label: `${got}/${max}`, ratio: Math.round((got / max) * 100) };
    }
    return { label: s, ratio: null };
  }
  return { label: s, ratio: null };
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

// ✅ Doivent matcher StudentAssessmentTake + TeacherGradingDetail (ids q1..)
const QUESTIONS: Question[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: "Quel est le résultat de 8 + 5 ?",
    choices: ["11", "12", "13", "14"],
    correct: "13",
    points: 2,
  },
  {
    id: "q2",
    type: "mcq",
    prompt: "Lequel est un nombre pair ?",
    choices: ["9", "11", "12", "15"],
    correct: "12",
    points: 2,
  },
  {
    id: "q3",
    type: "short",
    prompt: "Explique en une phrase ce qu’est une fraction.",
    points: 6,
  },
  {
    id: "q4",
    type: "mcq",
    prompt: "Quelle unité mesure une énergie ? (démo)",
    choices: ["Watt", "Joule", "Newton", "Volt"],
    correct: "Joule",
    points: 2,
  },
  {
    id: "q5",
    type: "short",
    prompt: "Donne un exemple de situation où l’on consomme de l’énergie.",
    points: 8,
  },
];

export default function StudentAssessmentResult() {
  const navigate = useNavigate();
  const { id } = useParams(); // assessmentId (a1/a2/a3)
  const studentId = "demo-student";

  ensureSeed();

  const assessment = useMemo(() => {
    if (!id) return null;
    return getAssessmentById(id);
  }, [id]);

  const attempt = useMemo(() => {
    if (!id) return null;
    return getAttemptFor(id, studentId) || null;
  }, [id]);

  const answers = useMemo(
    () => ((attempt?.answers || {}) as Record<string, string>),
    [attempt?.answers]
  );

  const grading = useMemo<TeacherGrading | null>(() => {
    return (attempt?.grading as TeacherGrading | undefined) ?? null;
  }, [attempt?.grading]);

  // ✅ clé produit: visible seulement si attempt.status === "published"
  const isPublished = attempt?.status === "published";
  const isSubmitted = Boolean(attempt);
  const isAutoCorrected = assessment?.type === "Quiz" && Boolean(attempt?.score);

  const hasOpenQuestions = useMemo(
    () => QUESTIONS.some((q) => q.type === "short"),
    []
  );

  const needsTeacherBlock = useMemo(() => {
    if (!assessment) return false;
    // Devoir/Examen => correction enseignant
    // Quiz => seulement si questions ouvertes (possible)
    return assessment.type !== "Quiz" || hasOpenQuestions;
  }, [assessment, hasOpenQuestions]);

  // collapse (UX): ouvert par défaut si Devoir/Examen, sinon fermé
  const [teacherOpen, setTeacherOpen] = useState<boolean>(() => {
    if (!assessment) return true;
    return assessment.type !== "Quiz";
  });

  // ===== Résumé pédagogique =====
  const summary = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    let manual = 0;

    for (const q of QUESTIONS) {
      const a = (answers[q.id] || "").trim();
      if (!a) {
        unanswered++;
        continue;
      }

      if (q.type === "short") {
        manual++;
        continue;
      }

      // QCM auto
      if (a === q.correct) correct++;
      else wrong++;
    }

    // Si correction publiée, on peut affiner: "À corriger" devient 0 si l’enseignant a noté les questions ouvertes
    if (isPublished && grading?.perQuestion) {
      const openIds = QUESTIONS.filter((q) => q.type === "short").map((q) => q.id);
      const openAllGraded = openIds.every((qid) => typeof grading.perQuestion?.[qid]?.pointsAwarded === "number");
      if (openAllGraded) manual = 0;
    }

    return { correct, wrong, manual, unanswered };
  }, [answers, grading?.perQuestion, isPublished]);

  // Score affiché :
  // - si publié: score enseignant prioritaire
  // - sinon: quiz auto score si quiz
  const scoreInfoAttempt = useMemo(
    () => parseScore(attempt?.score),
    [attempt?.score]
  );

  const scoreInfoTeacher = useMemo(() => {
    if (!isPublished) return null;
    return parseScore(grading?.finalScore);
  }, [grading?.finalScore, isPublished]);

  const displayedScoreLabel =
    scoreInfoTeacher?.label || scoreInfoAttempt?.label || "—";

  const progressRatio = useMemo(() => {
    const ratio = scoreInfoTeacher?.ratio ?? scoreInfoAttempt?.ratio;
    if (typeof ratio === "number") return ratio;

    const answeredCount = QUESTIONS.filter(
      (q) => (answers[q.id] || "").trim().length > 0
    ).length;

    return Math.round((answeredCount / Math.max(1, QUESTIONS.length)) * 100);
  }, [answers, scoreInfoAttempt?.ratio, scoreInfoTeacher?.ratio]);

  if (!id || !assessment) {
    return (
      <div className="sn-card p-6">
        <div className="text-lg font-semibold">Résultat</div>
        <div className="text-sm text-gray-500 mt-1">
          Évaluation introuvable (démo).
        </div>
        <div className="mt-4">
          <button
            className="sn-btn-primary sn-press"
            onClick={() => navigate("/app/student/assessments")}
          >
            ← Retour aux évaluations
          </button>
        </div>
      </div>
    );
  }

  const subtitle = `${assessment.title} • ${assessment.courseTitle} • ${assessment.className}`;

  const teacherStatusLabel = (() => {
    if (!needsTeacherBlock) return "";
    if (!isSubmitted) return "Non soumis";
    if (!grading) return "En attente";
    if (attempt?.status === "submitted") return "En attente";
    if (attempt?.status === "graded") return "Corrigé (non publié)";
    return "Publié";
  })();

  const canShowTeacherDetails = needsTeacherBlock && isPublished;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Résultat</div>
          <div className="text-sm text-gray-500">{subtitle}</div>
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => navigate("/app/student/assessments")}
        >
          ← Retour aux évaluations
        </button>
      </div>

      {/* Top card */}
      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeTypeClass(assessment.type)}>
              {assessment.type}
            </span>

            <span
              className={
                isSubmitted ? "sn-badge sn-badge-green" : "sn-badge sn-badge-gray"
              }
            >
              {isSubmitted ? "Soumis" : "Non soumis"}
            </span>

            <span className="sn-badge sn-badge-gray">{assessment.className}</span>

            {isAutoCorrected && (
              <span className="sn-badge sn-badge-gray">Auto-corrigé</span>
            )}

            {needsTeacherBlock && (
              <span
                className={
                  attempt?.status === "published"
                    ? "sn-badge sn-badge-green"
                    : attempt?.status === "graded"
                    ? "sn-badge sn-badge-blue"
                    : "sn-badge sn-badge-gray"
                }
              >
                {teacherStatusLabel}
              </span>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">Score</div>
            <div className="text-2xl font-bold text-gray-900">
              {displayedScoreLabel}
            </div>
          </div>
        </div>

        {/* progress bar */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${Math.min(100, Math.max(0, progressRatio))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{Math.min(100, Math.max(0, progressRatio))}%</span>
            <span>Soumis le : {formatDate(attempt?.submittedAtISO)}</span>
          </div>
        </div>

        {/* Résumé pédagogique */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900">
            Résumé pédagogique
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-green-50 border border-green-100 p-3">
              <div className="text-xs text-gray-600">Bonnes réponses</div>
              <div className="text-lg font-bold text-gray-900">
                ✅ {summary.correct}
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 border border-red-100 p-3">
              <div className="text-xs text-gray-600">Erreurs</div>
              <div className="text-lg font-bold text-gray-900">
                ❌ {summary.wrong}
              </div>
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
              <div className="text-xs text-gray-600">À corriger</div>
              <div className="text-lg font-bold text-gray-900">
                ⏳ {summary.manual}
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
              <div className="text-xs text-gray-600">Non répondu</div>
              <div className="text-lg font-bold text-gray-900">
                ⚪ {summary.unanswered}
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-500">
            *Bonnes/Erreurs = QCM. “À corriger” = réponses ouvertes (devoir/examen).*
          </div>
        </div>

        {/* ✅ Commentaire enseignant (seulement visible si publié) */}
        {needsTeacherBlock && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Commentaire enseignant
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {!isSubmitted
                    ? "Soumets l’évaluation pour recevoir une correction."
                    : canShowTeacherDetails
                    ? "Correction publiée par l’enseignant."
                    : attempt?.status === "graded"
                    ? "Correction faite, en attente de publication."
                    : "Correction en attente."}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={
                    attempt?.status === "published"
                      ? "sn-badge sn-badge-green"
                      : attempt?.status === "graded"
                      ? "sn-badge sn-badge-blue"
                      : "sn-badge sn-badge-gray"
                  }
                >
                  {teacherStatusLabel}
                </span>

                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={() => setTeacherOpen((v) => !v)}
                  aria-expanded={teacherOpen}
                >
                  {teacherOpen ? "Masquer" : "Afficher"}
                </button>
              </div>
            </div>

            <div
              className={[
                "transition-all duration-300 ease-out",
                teacherOpen
                  ? "opacity-100 translate-y-0 mt-4 max-h-[900px]"
                  : "opacity-0 -translate-y-1 mt-0 max-h-0 overflow-hidden pointer-events-none",
              ].join(" ")}
            >
              <div className="space-y-3">
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                  {canShowTeacherDetails
                    ? grading?.overallComment || "Aucun commentaire global."
                    : "Le commentaire sera visible après publication par l’enseignant."}
                </div>

                {/* Remarques par question (seulement si publié) */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700">
                    Remarques par question
                  </div>

                  <div className="space-y-2">
                    {QUESTIONS.map((q) => {
                      const fb = grading?.perQuestion?.[q.id];
                      const a = (answers[q.id] || "").trim();
                      const answered = Boolean(a);

                      return (
                        <div key={q.id} className="rounded-2xl border border-gray-100 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-gray-500">{q.id}</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {q.prompt}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  answered ? "sn-badge sn-badge-blue" : "sn-badge sn-badge-gray"
                                }
                              >
                                {answered ? "Répondu" : "Non répondu"}
                              </span>

                              {canShowTeacherDetails && typeof fb?.pointsAwarded === "number" && (
                                <span className="sn-badge sn-badge-green">
                                  {fb.pointsAwarded}/{q.points} pts
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-gray-700">
                            {canShowTeacherDetails ? (
                              fb?.comment ? (
                                fb.comment
                              ) : (
                                <span className="text-gray-500">Pas de remarque spécifique.</span>
                              )
                            ) : (
                              <span className="text-gray-500">
                                Détails visibles après publication.
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!canShowTeacherDetails && (
                  <div className="text-xs text-gray-500">
                    *L’enseignant doit cliquer sur “Publier” pour rendre la correction visible.*
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Détails questions + réponses */}
      <div className="sn-card p-5 space-y-4">
        <div className="font-semibold">Tes réponses</div>

        <div className="space-y-4">
          {QUESTIONS.map((q, idx) => {
            const a = (answers[q.id] || "").trim();
            const answered = Boolean(a);

            const isCorrect = q.type === "mcq" && answered && a === q.correct;

            const fb = grading?.perQuestion?.[q.id];
            const showPoints = canShowTeacherDetails && typeof fb?.pointsAwarded === "number";
            const showComment = canShowTeacherDetails && Boolean(fb?.comment);

            return (
              <div key={q.id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">
                      Question {idx + 1} • {q.points} pts
                      {showPoints ? (
                        <span className="ml-2">• Noté : {fb!.pointsAwarded}/{q.points}</span>
                      ) : null}
                    </div>
                    <div className="font-semibold text-gray-900">{q.prompt}</div>
                  </div>

                  <span
                    className={
                      answered
                        ? q.type === "mcq"
                          ? isCorrect
                            ? "sn-badge sn-badge-green"
                            : "sn-badge sn-badge-red"
                          : canShowTeacherDetails
                          ? "sn-badge sn-badge-green"
                          : "sn-badge sn-badge-gray"
                        : "sn-badge sn-badge-gray"
                    }
                  >
                    {answered
                      ? q.type === "mcq"
                        ? isCorrect
                          ? "Bonne réponse"
                          : "Mauvaise"
                        : canShowTeacherDetails
                        ? "Corrigé"
                        : "À corriger"
                      : "Non répondu"}
                  </span>
                </div>

                {q.type === "mcq" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.choices.map((c) => {
                      const selected = answered && a === c;
                      const correctChoice = c === q.correct;

                      const base = "rounded-2xl border p-3 text-left";
                      const cls =
                        selected && correctChoice
                          ? "border-green-500 bg-green-50"
                          : selected && !correctChoice
                          ? "border-red-300 bg-red-50"
                          : !selected && correctChoice
                          ? "border-green-200 bg-green-50/40"
                          : "border-gray-100 bg-white";

                      return (
                        <div key={c} className={`${base} ${cls}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm text-gray-900">{c}</div>
                            <div className="flex gap-2">
                              {correctChoice && (
                                <span className="sn-badge sn-badge-green">Bonne</span>
                              )}
                              {selected && (
                                <span className="sn-badge sn-badge-blue">Choisi</span>
                              )}
                            </div>
                          </div>

                          {selected && correctChoice && (
                            <div className="mt-2 text-xs text-green-700">
                              ✅ Tu as choisi la bonne réponse.
                            </div>
                          )}
                          {selected && !correctChoice && (
                            <div className="mt-2 text-xs text-red-700">
                              ❌ Mauvaise réponse. La bonne réponse était : <b>{q.correct}</b>.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                    {answered ? a : "Aucune réponse saisie."}

                    <div className="mt-2 text-xs text-gray-500">
                      {canShowTeacherDetails ? "✅ Corrigé par l’enseignant." : "*Réponse ouverte : correction manuelle.*"}
                    </div>

                    {showComment && (
                      <div className="mt-2 rounded-xl bg-white border border-gray-100 p-3 text-sm text-gray-800">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          Commentaire enseignant
                        </div>
                        {fb!.comment}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-500">
          *Workflow B : la correction devient visible uniquement après “Publier” côté enseignant.*
        </div>
      </div>
    </div>
  );
}
