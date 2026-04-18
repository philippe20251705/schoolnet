import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ensureSeed,
  getAssessmentById,
  getAttemptFor,
  submitAttempt,
  type AssessmentType,
} from "@/lib/mockStore";

type Question =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      choices: string[];
      points: number;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      placeholder?: string;
      points: number;
    };

type Assessment = {
  id: string; // a1/a2/a3...
  type: AssessmentType;
  title: string;
  course: string;
  section: string;
  durationMin?: number;
  totalPoints: number;
  questions: Question[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

// mapping routeId demo -> storeId réel
function toAssessmentId(routeId?: string) {
  const map: Record<string, string> = {
    sa1: "a1",
    sa2: "a2",
    sa3: "a3",
    sa4: "a1", // démo : remappé
    a1: "a1",
    a2: "a2",
    a3: "a3",
  };
  return map[routeId || "sa1"] || "a1";
}

// ✅ Questions uniques (doivent matcher Result + TeacherGradingDetail)
const QUESTIONS: Question[] = [
  {
    id: "q1",
    type: "mcq",
    prompt: "Quel est le résultat de 8 + 5 ?",
    choices: ["11", "12", "13", "14"],
    points: 2,
  },
  {
    id: "q2",
    type: "mcq",
    prompt: "Lequel est un nombre pair ?",
    choices: ["9", "11", "12", "15"],
    points: 2,
  },
  {
    id: "q3",
    type: "short",
    prompt: "Explique en une phrase ce qu’est une fraction.",
    placeholder: "Ta réponse...",
    points: 6,
  },
  {
    id: "q4",
    type: "mcq",
    prompt: "Quelle unité mesure une énergie ? (démo)",
    choices: ["Watt", "Joule", "Newton", "Volt"],
    points: 2,
  },
  {
    id: "q5",
    type: "short",
    prompt: "Donne un exemple de situation où l’on consomme de l’énergie.",
    placeholder: "Ex: ...",
    points: 8,
  },
];

function computeTotalPoints(qs: Question[]) {
  return qs.reduce((acc, q) => acc + q.points, 0);
}

export default function StudentAssessmentTake() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const routeId = params.id;

  const studentId = "demo-student";

  // seed (safe)
  useEffect(() => {
    ensureSeed();
  }, []);

  // ✅ store id: a1/a2/a3
  const assessmentId = useMemo(() => toAssessmentId(routeId), [routeId]);

  // ✅ base info depuis le store (titre/type/infos)
  const published = useMemo(() => getAssessmentById(assessmentId), [assessmentId]);

  // ✅ fallback demo si store pas trouvé (évite crash)
  const assessment = useMemo<Assessment>(() => {
    const fallbackType: AssessmentType =
      assessmentId === "a3" ? "Examen" : assessmentId === "a2" ? "Devoir" : "Quiz";

    const meta = published
      ? {
          type: published.type,
          title: published.title,
          course: published.courseTitle,
          section: published.sectionTitle,
          durationMin: published.type === "Examen" ? 30 : undefined,
        }
      : {
          type: fallbackType,
          title: fallbackType === "Quiz" ? "Quiz — Chapitre 1" : "Évaluation",
          course: "Cours",
          section: "Section",
          durationMin: fallbackType === "Examen" ? 30 : undefined,
        };

    return {
      id: assessmentId,
      type: meta.type,
      title: meta.title,
      course: meta.course,
      section: meta.section,
      durationMin: meta.durationMin,
      questions: QUESTIONS,
      totalPoints: computeTotalPoints(QUESTIONS),
    };
  }, [assessmentId, published]);

  // ✅ si déjà une tentative existe (in_progress/submitted…), on la reprend
  const existingAttempt = useMemo(() => {
    return getAttemptFor(assessment.id, studentId);
  }, [assessment.id]);

  // ---- Etats ----
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ✅ charge réponses depuis attempt si existante
  useEffect(() => {
    setCurrentIndex(0);
    setSubmitting(false);
    setAnswers(existingAttempt?.answers ?? {});
  }, [assessment.id, existingAttempt?.id]);

  const current = assessment.questions[currentIndex];
  const total = assessment.questions.length;

  const answeredCount = useMemo(() => {
    return assessment.questions.reduce(
      (acc, q) => acc + ((answers[q.id] || "").trim() ? 1 : 0),
      0
    );
  }, [answers, assessment.questions]);

  const progress = Math.round((answeredCount / Math.max(1, total)) * 100);

  // ---- Timer ----
  const hasTimer = assessment.type === "Examen" || typeof assessment.durationMin === "number";
  const initialSeconds = useMemo(() => {
    const d = assessment.durationMin ?? (assessment.type === "Examen" ? 30 : undefined);
    return d ? d * 60 : 0;
  }, [assessment.durationMin, assessment.type]);

  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  // reset timer quand l’éval change
  useEffect(() => {
    if (!hasTimer) return;
    setSecondsLeft(initialSeconds);
  }, [hasTimer, initialSeconds]);

  // tick timer
  useEffect(() => {
    if (!hasTimer) return;
    if (submitting) return;
    if (secondsLeft <= 0) return;

    const t = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(t);
  }, [hasTimer, secondsLeft, submitting]);

  // anti double-submit (timer / click)
  const submitLockRef = useRef(false);

  const isDirty = useMemo(() => answeredCount > 0 && !submitting, [answeredCount, submitting]);

  // ✅ Empêche quitter par erreur (refresh/fermeture onglet)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function setAnswer(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  function goPrev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }

  function confirmLeave() {
    if (!isDirty) return true;
    return window.confirm("Tu as des réponses non soumises. Quitter quand même ?");
  }

  function handleBack() {
    if (!confirmLeave()) return;
    navigate(-1);
  }

  function doSubmit(auto = false) {
    if (submitting) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setSubmitting(true);

    // snapshot stable
    const snapshotAnswers = { ...answers };

    window.setTimeout(() => {
      // ✅ workflow B : on crée/maj une tentative en status "submitted"
      submitAttempt({
        assessmentId: assessment.id,
        studentId,
        answers: snapshotAnswers,
      });

      setSubmitting(false);
      submitLockRef.current = false;

      // ✅ direction résultat (où on affichera grading ensuite)
      navigate(`/app/student/assessments/${assessment.id}/result`, { replace: true });

      // mini toast (démo)
      if (auto) {
        alert("⏰ Temps écoulé — soumission effectuée (démo).");
      }
    }, 350);
  }

  // auto submit à 0
  useEffect(() => {
    if (!hasTimer) return;
    if (secondsLeft === 0) doSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, hasTimer]);

  const showWarning = hasTimer && secondsLeft <= 60;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{assessment.title}</div>
          <div className="text-sm text-gray-500">
            {assessment.course} • {assessment.section}
          </div>
          {existingAttempt?.submittedAtISO && (
            <div className="mt-1 text-xs text-gray-500">
              Reprise d’une tentative enregistrée (démo).
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={handleBack} disabled={submitting}>
            ← Retour
          </button>

          {hasTimer && (
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm ${
                showWarning ? "bg-red-600 text-white" : "bg-gray-100 text-gray-800"
              }`}
              title="Timer (démo)"
            >
              ⏱ {formatTime(Math.max(0, secondsLeft))}
            </div>
          )}

          <button className="sn-btn-primary sn-press" onClick={() => doSubmit(false)} disabled={submitting}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                Soumission...
              </span>
            ) : (
              "Soumettre"
            )}
          </button>
        </div>
      </div>

      {/* Progress / stats */}
      <div className="sn-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          Progression : <span className="font-semibold">{answeredCount}</span>/{total} réponses •{" "}
          <span className="font-semibold">{progress}%</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="sn-badge sn-badge-gray">{assessment.type}</span>
          <span className="sn-badge sn-badge-gray">{assessment.totalPoints} pts</span>
          {hasTimer && <span className="sn-badge sn-badge-gray">{assessment.durationMin ?? 30} min</span>}
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Question */}
        <div className="lg:col-span-2 sn-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">
              Question {currentIndex + 1} / {total}
            </div>
            <span className="sn-badge sn-badge-gray">{current.points} pts</span>
          </div>

          <div className="text-gray-900 font-semibold">{current.prompt}</div>

          {current.type === "mcq" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {current.choices.map((c) => {
                const selected = answers[current.id] === c;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={submitting}
                    className={`rounded-2xl border p-3 text-left transition sn-press ${
                      selected ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white hover:bg-gray-50"
                    }`}
                    onClick={() => setAnswer(current.id, c)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-900">{c}</div>
                      {selected && <span className="sn-badge sn-badge-blue">Choisi</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                className="w-full min-h-[140px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder={current.placeholder || "Votre réponse..."}
                value={answers[current.id] || ""}
                onChange={(e) => setAnswer(current.id, e.target.value)}
                disabled={submitting}
              />
              <div className="text-xs text-gray-500">
                Astuce : réponds clairement. La correction sera faite par l’enseignant (devoir/examen).
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button className="sn-btn-ghost sn-press" onClick={goPrev} disabled={currentIndex === 0 || submitting}>
              ← Précédent
            </button>

            <button
              className="sn-btn-primary sn-press"
              onClick={goNext}
              disabled={currentIndex === total - 1 || submitting}
            >
              Suivant →
            </button>
          </div>
        </div>

        {/* Navigator / summary */}
        <div className="space-y-4">
          <div className="sn-card p-5 space-y-3">
            <div className="font-semibold">Questions</div>

            <div className="grid grid-cols-5 gap-2">
              {assessment.questions.map((q, idx) => {
                const has = (answers[q.id] || "").trim().length > 0;
                const active = idx === currentIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    disabled={submitting}
                    className={`h-10 rounded-xl text-sm font-semibold transition sn-press ${
                      active
                        ? "bg-blue-600 text-white"
                        : has
                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    title={has ? "Répondu" : "Non répondu"}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-gray-500">Bleu clair = répondu • Gris = à faire • Bleu = active</div>
          </div>

          <div className="sn-card p-5 space-y-3">
            <div className="font-semibold">Résumé</div>
            <div className="text-sm text-gray-700 space-y-1">
              <div>
                Réponses : <span className="font-semibold">{answeredCount}</span>/{total}
              </div>
              <div>
                Points max : <span className="font-semibold">{assessment.totalPoints}</span>
              </div>
              {hasTimer && (
                <div>
                  Temps restant :{" "}
                  <span className={`font-semibold ${showWarning ? "text-red-600" : ""}`}>
                    {formatTime(Math.max(0, secondsLeft))}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button className="sn-btn-primary w-full sn-press" onClick={() => doSubmit(false)} disabled={submitting}>
                {submitting ? "Soumission..." : "Soumettre"}
              </button>
            </div>

            <div className="text-xs text-gray-500">
              *Mode démo : la soumission crée une tentative “submitted” (workflow correction enseignant).*
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
