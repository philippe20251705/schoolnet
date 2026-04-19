import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type SubmissionStatus = "in_progress" | "submitted" | "graded";

type AssessmentRow = {
  id: string;
  title: string;
  description: string | null;
  type: AssessmentType;
  max_score: number | null;
  course_id: string;
  section_id: string | null;
  courses:
    | {
        id: string;
        title: string;
      }
    | {
        id: string;
        title: string;
      }[]
    | null;
  course_sections:
    | {
        id: string;
        title: string;
      }
    | {
        id: string;
        title: string;
      }[]
    | null;
};

type SubmissionRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type QuizQuestionRow = {
  id: string;
  assessment_id: string;
  question_type: "mcq" | "true_false" | "short_text";
  prompt: string;
  order_index: number;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string;
};

type SubmissionAnswerRow = {
  question_id: string;
  answer_text: string | null;
  choice_id: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
};

type QuestionView =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      points: number;
      choices: { id: string; label: string }[];
      answerLabel: string;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      points: number;
      answerLabel: string;
    };

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function badgeTypeClass(type: "Quiz" | "Devoir" | "Examen") {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function mapType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function badgeStatus(status?: SubmissionStatus) {
  if (status === "graded") return "sn-badge sn-badge-green";
  if (status === "submitted") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusLabel(s?: SubmissionStatus) {
  if (s === "in_progress") return "En cours";
  if (s === "submitted") return "Soumis";
  if (s === "graded") return "Corrigé";
  return "—";
}

function safeNumber(v: string) {
  const s = v.replace(",", ".").trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(walk);

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = walk(obj[k]);
    return out;
  };

  try {
    return JSON.stringify(walk(value));
  } catch {
    return "";
  }
}

export default function TeacherGradingDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const studentId = searchParams.get("studentId") || "";

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [student, setStudent] = useState<ProfileRow | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [studentClassLabel, setStudentClassLabel] = useState("Classe non assignée");

  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialDraftRef = useRef("");

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError("Évaluation introuvable.");
      setLoading(false);
      return;
    }

    if (!studentId) {
      setError("Élève introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setError("La correction réelle n’est pas disponible en mode démo.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [assessmentResult, submissionResult, studentResult] = await Promise.all([
        supabase
          .from("assessments")
          .select(
            `
            id,
            title,
            description,
            type,
            max_score,
            course_id,
            section_id,
            courses (
              id,
              title
            ),
            course_sections (
              id,
              title
            )
          `
          )
          .eq("id", id)
          .single(),

        supabase
          .from("submissions")
          .select("id, assessment_id, student_id, submitted_at, status, score, feedback")
          .eq("assessment_id", id)
          .eq("student_id", studentId)
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", studentId)
          .maybeSingle(),
      ]);

      if (assessmentResult.error) throw assessmentResult.error;
      if (submissionResult.error) throw submissionResult.error;
      if (studentResult.error) throw studentResult.error;

      const assessmentData = assessmentResult.data as AssessmentRow;
      const submissionData = submissionResult.data as SubmissionRow | null;
      const studentData = studentResult.data as ProfileRow | null;

      if (!submissionData) {
        setError("Aucune soumission trouvée pour cet élève.");
        setAssessment(assessmentData);
        setStudent(studentData);
        setSubmission(null);
        setQuestions([]);
        setStudentClassLabel("Classe non assignée");
        return;
      }

      const { data: classStudentsData, error: classStudentsError } = await supabase
        .from("class_students")
        .select("student_id, class_id")
        .eq("student_id", studentId);

      if (classStudentsError) throw classStudentsError;

      const classStudents = (classStudentsData ?? []) as ClassStudentRow[];
      const classIds = Array.from(new Set(classStudents.map((row) => row.class_id)));

      let computedClassLabel = "Classe non assignée";

      if (classIds.length > 0) {
        const { data: classesData, error: classesError } = await supabase
          .from("classes")
          .select("id, name, school_year")
          .in("id", classIds);

        if (classesError) throw classesError;

        const classes = (classesData ?? []) as ClassRow[];
        const firstClass = classes[0];
        if (firstClass) {
          computedClassLabel = `${firstClass.name} (${firstClass.school_year})`;
        }
      }

      const { data: questionRowsData, error: questionsError } = await supabase
        .from("quiz_questions")
        .select("id, assessment_id, question_type, prompt, order_index")
        .eq("assessment_id", id)
        .order("order_index", { ascending: true });

      if (questionsError) throw questionsError;

      const questionRows = (questionRowsData ?? []) as QuizQuestionRow[];
      const questionIds = questionRows.map((q) => q.id);

      let choiceRows: QuizChoiceRow[] = [];
      if (questionIds.length > 0) {
        const { data: choiceRowsData, error: choicesError } = await supabase
          .from("quiz_choices")
          .select("id, question_id, choice_text")
          .in("question_id", questionIds);

        if (choicesError) throw choicesError;

        choiceRows = (choiceRowsData ?? []) as QuizChoiceRow[];
      }

      const { data: answerRowsData, error: answersError } = await supabase
        .from("submission_answers")
        .select("question_id, answer_text, choice_id")
        .eq("submission_id", submissionData.id);

      if (answersError) throw answersError;

      const answerRows = (answerRowsData ?? []) as SubmissionAnswerRow[];

      const answerByQuestionId = answerRows.reduce<Record<string, SubmissionAnswerRow>>((acc, row) => {
        acc[row.question_id] = row;
        return acc;
      }, {});

      const mappedQuestions: QuestionView[] =
        questionRows.length > 0
          ? questionRows.map((q) => {
              const answer = answerByQuestionId[q.id];
              const points =
                assessmentData.max_score && questionRows.length > 0
                  ? Math.max(1, Math.round(assessmentData.max_score / questionRows.length))
                  : 1;

              if (q.question_type === "mcq" || q.question_type === "true_false") {
                const fallbackChoices =
                  q.question_type === "true_false"
                    ? [
                        { id: `${q.id}-true`, label: "Vrai" },
                        { id: `${q.id}-false`, label: "Faux" },
                      ]
                    : [];

                const choices =
                  q.question_type === "true_false"
                    ? fallbackChoices
                    : choiceRows
                        .filter((choice) => choice.question_id === q.id)
                        .map((choice) => ({
                          id: choice.id,
                          label: choice.choice_text,
                        }));

                const answerLabel =
                  q.question_type === "true_false"
                    ? answer?.answer_text || "Aucune réponse."
                    : choices.find((c) => c.id === answer?.choice_id)?.label || "Aucune réponse.";

                return {
                  id: q.id,
                  type: "mcq" as const,
                  prompt: q.prompt,
                  points,
                  choices,
                  answerLabel,
                };
              }

              return {
                id: q.id,
                type: "short" as const,
                prompt: q.prompt,
                points,
                answerLabel: answer?.answer_text || "Aucune réponse.",
              };
            })
          : [
              {
                id: "fallback-display",
                type: "short" as const,
                prompt:
                  assessmentData.description?.trim() ||
                  "Cette évaluation ne contient pas encore de questions détaillées.",
                points: assessmentData.max_score ?? 20,
                answerLabel:
                  submissionData.feedback?.trim() ||
                  "Soumission enregistrée sans réponses détaillées.",
              },
            ];

      setAssessment(assessmentData);
      setSubmission(submissionData);
      setStudent(studentData);
      setQuestions(mappedQuestions);
      setStudentClassLabel(computedClassLabel);

      const nextScore =
        submissionData.score !== null && submissionData.score !== undefined
          ? String(submissionData.score)
          : "";

      const nextFeedback = submissionData.feedback ?? "";

      setScore(nextScore);
      setFeedback(nextFeedback);

      initialDraftRef.current = stableStringify({
        score: nextScore,
        feedback: nextFeedback.trim(),
      });
    } catch (err) {
      console.error("[TeacherGradingDetail] loadDetail error:", err);
      setError("Impossible de charger le détail de la copie.");
      setAssessment(null);
      setSubmission(null);
      setStudent(null);
      setQuestions([]);
      setStudentClassLabel("Classe non assignée");
    } finally {
      setLoading(false);
    }
  }, [id, studentId, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadDetail();
  }, [authLoading, loadDetail]);

  const hasUnsaved = useMemo(() => {
    if (!initialDraftRef.current) return false;
    const current = stableStringify({
      score: score.trim(),
      feedback: feedback.trim(),
    });
    return current !== initialDraftRef.current;
  }, [score, feedback]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const maxScore = assessment?.max_score ?? 20;
  const scoreNumber = useMemo(() => {
    const parsed = safeNumber(score);
    return typeof parsed === "number" ? clamp(parsed, 0, maxScore) : undefined;
  }, [score, maxScore]);

  async function onSaveGrade() {
    if (!submission) return;
    if (saving) return;

    try {
      setSaving(true);

      const updatePayload: {
        score?: number | null;
        feedback?: string | null;
        status?: SubmissionStatus;
      } = {
        feedback: feedback.trim() || null,
        status: "graded",
      };

      updatePayload.score =
        typeof scoreNumber === "number" ? scoreNumber : null;

      const { error: updateError } = await supabase
        .from("submissions")
        .update(updatePayload)
        .eq("id", submission.id);

      if (updateError) throw updateError;

      initialDraftRef.current = stableStringify({
        score: score.trim(),
        feedback: feedback.trim(),
      });

      await loadDetail();
      alert("✅ Correction enregistrée.");
    } catch (err: any) {
      console.error("[TeacherGradingDetail] onSaveGrade error:", err);

      const message =
        err?.message ||
        err?.error_description ||
        err?.details ||
        "Impossible d’enregistrer la correction.";

      alert(message);
    } finally {
      setSaving(false);
    }
  }

  const assessmentType = assessment ? mapType(assessment.type) : "Quiz";
  const courseTitle = assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = assessment
    ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
    : "Sans section";

  const studentDisplayName = student?.full_name?.trim() || "Élève";

  const isLoading = authLoading || loading;

  if (!id) {
    return (
      <div className="sn-card p-6 space-y-3">
        <div className="text-lg font-semibold">Correction</div>
        <div className="text-sm text-gray-500">Évaluation introuvable.</div>
        <button className="sn-btn-primary sn-press w-fit" onClick={() => navigate("/app/teacher/grading")}>
          ← Retour
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Correction</div>
          <div className="text-sm text-gray-500">
            <span className={badgeTypeClass(assessmentType)}>{assessmentType}</span>
            <span className="ml-2">{assessment?.title ?? "Évaluation"}</span> • {courseTitle} • {sectionTitle}
          </div>

          {submission && (
            <div className="mt-2 text-xs text-gray-500">
              Soumis : {formatDateTime(submission.submitted_at)}
            </div>
          )}
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => {
            if (hasUnsaved) {
              const ok = window.confirm("Tu as des modifications non enregistrées. Quitter quand même ?");
              if (!ok) return;
            }
            navigate("/app/teacher/grading");
          }}
        >
          ← Retour
        </button>
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-4 space-y-3 animate-pulse">
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-16 rounded bg-gray-100" />
          </div>
          <div className="lg:col-span-2 sn-card p-5 space-y-4 animate-pulse">
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && submission && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Copie</div>
              <span className={badgeStatus(submission.status)}>{statusLabel(submission.status)}</span>
            </div>

            <div className="text-sm text-gray-700">
              <div className="font-semibold text-gray-900">{studentDisplayName}</div>
              <div className="text-xs text-gray-500 mt-1">{studentClassLabel}</div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-900">Notation</div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Score global</label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  inputMode="decimal"
                  placeholder={`0 - ${maxScore}`}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  disabled={saving}
                />
                <div className="text-xs text-gray-500">Maximum : {maxScore} pts</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Feedback global</label>
                <textarea
                  className="w-full min-h-[140px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Commentaire global pour l’élève..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={saving}
                />
              </div>

              <button
                className="sn-btn-primary sn-press w-full"
                onClick={onSaveGrade}
                disabled={saving}
              >
                {saving ? "Enregistrement..." : "Enregistrer correction"}
              </button>
            </div>

            <div className="text-xs text-gray-500">
              *Cette version enregistre une note globale et un feedback global dans Supabase.*
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="sn-card p-5 space-y-4">
              <div className="font-semibold">Réponses de l’élève</div>

              {questions.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune réponse détaillée disponible.</div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, idx) => (
                    <div
                      key={question.id}
                      className="rounded-2xl border border-gray-100 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-gray-500">
                            Question {idx + 1} • {question.points} pts
                          </div>
                          <div className="font-semibold text-gray-900">{question.prompt}</div>
                        </div>
                        <span className="sn-badge sn-badge-gray">
                          {question.type === "mcq" ? "QCM" : "Réponse ouverte"}
                        </span>
                      </div>

                      {question.type === "mcq" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {question.choices.map((choice) => {
                            const isChosen = question.answerLabel === choice.label;
                            return (
                              <div
                                key={choice.id}
                                className={`rounded-2xl border p-3 text-left ${
                                  isChosen
                                    ? "border-blue-600 bg-blue-50"
                                    : "border-gray-100 bg-white"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-gray-900">{choice.label}</div>
                                  {isChosen && <span className="sn-badge sn-badge-blue">Choisi</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                          {question.answerLabel}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}