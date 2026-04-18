// src/features/teacher/pages/TeacherGradingDetail.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ensureSeed,
  getAssessmentById,
  getAttemptsForAssessment,
  getStudentById,
  gradeAttempt,
  publishAttempt,
  toScoreLabel,
  type Attempt,
  type AssessmentType,
} from "@/lib/mockStore";
import { getQuestionsForAssessment, type Question } from "@/lib/questionBank";

type PerQuestionDraft = Record<
  string,
  {
    pointsAwarded?: number;
    comment?: string;
  }
>;

type StatusFilter = "all" | Attempt["status"];

function badgeTypeClass(type: AssessmentType) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function badgeStatus(status?: Attempt["status"]) {
  if (status === "published") return "sn-badge sn-badge-green";
  if (status === "graded") return "sn-badge sn-badge-blue";
  if (status === "submitted") return "sn-badge sn-badge-gray";
  if (status === "in_progress") return "sn-badge sn-badge-gray";
  return "sn-badge sn-badge-gray";
}

function statusLabel(s: Attempt["status"]) {
  if (s === "in_progress") return "En cours";
  if (s === "submitted") return "Soumis";
  if (s === "graded") return "Corrigé";
  return "Publié";
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

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Stable stringify (deep) pour comparer les drafts sans faux positifs.
 * - trie les clés récursivement
 * - supporte objets / arrays / primitives
 */
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
  const params = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const assessmentId = params.id;

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    ensureSeed();
  }, []);

  const assessment = useMemo(() => {
    if (!assessmentId) return null;
    return getAssessmentById(assessmentId);
  }, [assessmentId, refreshKey]);

  const questions: Question[] = useMemo(() => {
    if (!assessmentId) return [];
    return getQuestionsForAssessment(assessmentId, assessment?.type);
  }, [assessmentId, assessment?.type]);

  const allAttempts = useMemo(() => {
    if (!assessmentId) return [];
    const all = getAttemptsForAssessment(assessmentId);

    // tri : in_progress → submitted → graded → published, puis plus récent
    const order = (s: Attempt["status"]) =>
      s === "in_progress" ? 0 : s === "submitted" ? 1 : s === "graded" ? 2 : s === "published" ? 3 : 9;

    return [...all].sort((a, b) => {
      const oa = order(a.status);
      const ob = order(b.status);
      if (oa !== ob) return oa - ob;

      const ta = a.submittedAtISO ? new Date(a.submittedAtISO).getTime() : 0;
      const tb = b.submittedAtISO ? new Date(b.submittedAtISO).getTime() : 0;
      return tb - ta;
    });
  }, [assessmentId, refreshKey]);

  const studentsById = useMemo(() => {
    const map: Record<string, ReturnType<typeof getStudentById>> = {};
    for (const a of allAttempts) {
      if (!map[a.studentId]) map[a.studentId] = getStudentById(a.studentId);
    }
    return map;
  }, [allAttempts]);

  // UI filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const attempts = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allAttempts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;

      const s = studentsById[a.studentId];
      const name = (s?.name || a.studentId).toLowerCase();
      return name.includes(q);
    });
  }, [allAttempts, statusFilter, query, studentsById]);

  const counts = useMemo(() => {
    const c: Record<Attempt["status"], number> = {
      in_progress: 0,
      submitted: 0,
      graded: 0,
      published: 0,
    };
    for (const a of allAttempts) c[a.status] += 1;
    return c;
  }, [allAttempts]);

  // selection
  const selectedStudentId = searchParams.get("studentId") || undefined;

  const selectedAttempt = useMemo(() => {
    if (!allAttempts.length) return null;
    if (selectedStudentId) {
      const found = allAttempts.find((a) => a.studentId === selectedStudentId);
      if (found) return found;
    }
    return allAttempts[0];
  }, [allAttempts, selectedStudentId]);

  const student = useMemo(() => {
    if (!selectedAttempt) return null;
    return studentsById[selectedAttempt.studentId] || getStudentById(selectedAttempt.studentId);
  }, [selectedAttempt?.studentId, studentsById]);

  // Draft local
  const [overallComment, setOverallComment] = useState("");
  const [perQuestion, setPerQuestion] = useState<PerQuestionDraft>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const initialDraftRef = useRef<string>("");

  const draftFingerprint = useMemo(() => {
    return stableStringify({
      overallComment: overallComment.trim(),
      perQuestion,
    });
  }, [overallComment, perQuestion]);

  const hasUnsaved = useMemo(() => {
    if (!initialDraftRef.current) return false;
    return draftFingerprint !== initialDraftRef.current;
  }, [draftFingerprint]);

  // charger draft quand on change de copie
  useEffect(() => {
    if (!selectedAttempt) return;

    const nextOverall = selectedAttempt.grading?.overallComment || "";
    const nextPQ = (selectedAttempt.grading?.perQuestion || {}) as PerQuestionDraft;

    setOverallComment(nextOverall);
    setPerQuestion(nextPQ);
    setSaving(false);
    setPublishing(false);

    initialDraftRef.current = stableStringify({
      overallComment: nextOverall.trim(),
      perQuestion: nextPQ,
    });
  }, [selectedAttempt?.id, refreshKey]);

  // warn before leaving tab if unsaved
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const answers = (selectedAttempt?.answers || {}) as Record<string, string>;

  const totalMaxPoints = useMemo(() => questions.reduce((acc, q) => acc + q.points, 0), [questions]);

  const totalAwarded = useMemo(() => {
    return questions.reduce((acc, q) => {
      const got = perQuestion[q.id]?.pointsAwarded;
      if (typeof got !== "number") return acc;
      return acc + clamp(got, 0, q.points);
    }, 0);
  }, [questions, perQuestion]);

  const finalScoreLabel = useMemo(() => toScoreLabel(totalAwarded, totalMaxPoints), [totalAwarded, totalMaxPoints]);

  // Locking rules
  const isPublished = selectedAttempt?.status === "published";
  const isLocked = Boolean(isPublished); // ✅ on verrouille si publié (mode parent/élève)
  const canGrade = Boolean(assessment && assessmentId && selectedAttempt) && !isLocked;
  const canPublish = Boolean(selectedAttempt && selectedAttempt.status !== "published");

  // timeline info
  const gradedAt = selectedAttempt?.grading?.gradedAtISO;
  const publishedAt = selectedAttempt?.grading?.publishedAtISO;

  const selectAttempt = useCallback(
    (studentId: string) => {
      if (hasUnsaved && !isLocked) {
        const ok = window.confirm("Tu as des modifications non enregistrées. Continuer et les perdre ?");
        if (!ok) return;
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("studentId", studentId);
        return next;
      });
    },
    [hasUnsaved, isLocked, setSearchParams]
  );

  const setPoints = useCallback((qid: string, raw: string, maxPoints: number) => {
    const n = raw === "" ? undefined : safeNumber(raw);
    setPerQuestion((prev) => ({
      ...prev,
      [qid]: {
        ...(prev[qid] || {}),
        pointsAwarded: typeof n === "number" ? clamp(n, 0, maxPoints) : undefined,
      },
    }));
  }, []);

  const setComment = useCallback((qid: string, comment: string) => {
    setPerQuestion((prev) => ({
      ...prev,
      [qid]: {
        ...(prev[qid] || {}),
        comment,
      },
    }));
  }, []);

  const autofillMCQ = useCallback(() => {
    if (!selectedAttempt) return;
    if (isLocked) return;

    setPerQuestion((prev) => {
      const next = { ...prev };
      for (const q of questions) {
        if (q.type !== "mcq" || !q.correct) continue;
        const a = (answers[q.id] || "").trim();
        if (!a) continue;
        const got = a === q.correct ? q.points : 0;
        next[q.id] = { ...(next[q.id] || {}), pointsAwarded: got };
      }
      return next;
    });
  }, [answers, questions, selectedAttempt, isLocked]);

  async function onSaveGrade() {
    if (!assessmentId || !selectedAttempt) return;
    if (saving || publishing) return;
    if (isLocked) return;

    setSaving(true);
    try {
      const clamped: PerQuestionDraft = {};
      for (const q of questions) {
        const got = perQuestion[q.id]?.pointsAwarded;
        const safe = typeof got === "number" ? clamp(got, 0, q.points) : undefined;

        clamped[q.id] = {
          comment: perQuestion[q.id]?.comment?.trim() || undefined,
          pointsAwarded: safe,
        };
      }

      const next = gradeAttempt({
        assessmentId,
        studentId: selectedAttempt.studentId,
        grading: {
          overallComment: overallComment.trim() || undefined,
          perQuestion: clamped,
          finalScore: finalScoreLabel,
        },
      });

      if (!next) {
        alert("Impossible d’enregistrer la correction (démo).");
        return;
      }

      setRefreshKey((k) => k + 1);

      initialDraftRef.current = stableStringify({
        overallComment: (overallComment || "").trim(),
        perQuestion: clamped,
      });

      alert("✅ Correction enregistrée.");
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set("studentId", selectedAttempt.studentId);
        return p;
      });
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    if (!assessmentId || !selectedAttempt) return;
    if (saving || publishing) return;
    if (selectedAttempt.status === "published") return;

    setPublishing(true);
    try {
      // ✅ si c'est "submitted", on enregistre d’abord
      if (selectedAttempt.status === "submitted") {
        await onSaveGrade();
      }

      const next = publishAttempt({
        assessmentId,
        studentId: selectedAttempt.studentId,
      });

      if (!next) {
        alert("Impossible de publier (démo).");
        return;
      }

      setRefreshKey((k) => k + 1);
      alert("📣 Publié ! Visible côté élève/parent.");
    } finally {
      setPublishing(false);
    }
  }

  if (!assessmentId || !assessment) {
    return (
      <div className="sn-card p-6 space-y-3">
        <div className="text-lg font-semibold">Correction</div>
        <div className="text-sm text-gray-500">Évaluation introuvable (id: {assessmentId || "—"}).</div>
        <button className="sn-btn-primary sn-press w-fit" onClick={() => navigate("/app/teacher/grading")}>
          ← Retour
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Correction</div>
          <div className="text-sm text-gray-500">
            <span className={badgeTypeClass(assessment.type)}>{assessment.type}</span>{" "}
            <span className="ml-2">{assessment.title}</span> • {assessment.className} • {assessment.sectionTitle}
          </div>

          {/* Timeline */}
          {selectedAttempt && (
            <div className="mt-2 text-xs text-gray-500">
              {selectedAttempt.submittedAtISO ? <>Soumis : {formatDateTime(selectedAttempt.submittedAtISO)} • </> : null}
              {gradedAt ? <>Corrigé : {formatDateTime(gradedAt)} • </> : null}
              {publishedAt ? <>Publié : {formatDateTime(publishedAt)}</> : null}
            </div>
          )}
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => {
            if (hasUnsaved && !isLocked) {
              const ok = window.confirm("Tu as des modifications non enregistrées. Quitter quand même ?");
              if (!ok) return;
            }
            navigate("/app/teacher/grading");
          }}
        >
          ← Retour
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT */}
        <div className="sn-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Copies</div>
            <span className="sn-badge sn-badge-gray">{allAttempts.length}</span>
          </div>

          {/* filters */}
          <div className="grid gap-2">
            <input
              className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Rechercher un élève…"
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
                Soumis ({counts.submitted})
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
            </div>
          </div>

          {attempts.length === 0 ? (
            <div className="text-sm text-gray-500">Aucune copie (selon filtre).</div>
          ) : (
            <div className="space-y-2">
              {attempts.map((a) => {
                const s = studentsById[a.studentId];
                const active = selectedAttempt?.id === a.id;

                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => selectAttempt(a.studentId)}
                    className={[
                      "w-full text-left rounded-2xl border p-3 sn-press transition",
                      active ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{s?.name || a.studentId}</div>
                        <div className="text-xs text-gray-500">
                          {a.submittedAtISO ? new Date(a.submittedAtISO).toLocaleString() : "—"}
                        </div>
                      </div>
                      <span className={badgeStatus(a.status)}>{statusLabel(a.status)}</span>
                    </div>

                    {a.score && (
                      <div className="mt-2 text-xs text-gray-700">
                        Score: <span className="font-semibold">{a.score}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedAttempt ? (
            <div className="sn-card p-6 text-sm text-gray-500">Sélectionne une copie à corriger.</div>
          ) : (
            <>
              {/* summary */}
              <div className="sn-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{student?.name || selectedAttempt.studentId}</div>

                    <div className="text-sm text-gray-500">
                      Statut :{" "}
                      <span className={badgeStatus(selectedAttempt.status)}>{statusLabel(selectedAttempt.status)}</span>

                      {isLocked && <span className="ml-2 sn-badge sn-badge-green">Verrouillé (publié)</span>}

                      {hasUnsaved && !isLocked && (
                        <span className="ml-2 sn-badge sn-badge-gray">Modifs non enregistrées</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-500">{isLocked ? "Score (enregistré)" : "Score (prévisualisation)"}</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {selectedAttempt.grading?.finalScore || selectedAttempt.score || finalScoreLabel}
                    </div>
                    <div className="text-xs text-gray-500">
                      {totalAwarded} / {totalMaxPoints} pts
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="sn-btn-ghost sn-press"
                    type="button"
                    onClick={autofillMCQ}
                    disabled={!canGrade || saving || publishing}
                    title={isLocked ? "Copie publiée : édition verrouillée" : "Auto-note les QCM (bonne réponse = points max, sinon 0)"}
                  >
                    ⚡ Auto QCM
                  </button>

                  <button
                    className="sn-btn-primary sn-press"
                    onClick={onSaveGrade}
                    disabled={!canGrade || saving || publishing}
                    title={isLocked ? "Copie publiée : édition verrouillée" : undefined}
                  >
                    {saving ? "Enregistrement..." : "Enregistrer correction"}
                  </button>

                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={onPublish}
                    disabled={!canPublish || saving || publishing}
                    title={selectedAttempt.status === "published" ? "Déjà publié" : "Publier la correction"}
                  >
                    {selectedAttempt.status === "published"
                      ? "Déjà publié"
                      : publishing
                      ? "Publication..."
                      : "Publier"}
                  </button>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-900">Commentaire global</div>
                  <textarea
                    className="w-full min-h-[110px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Ex: Bon travail, mais attention à..."
                    value={overallComment}
                    onChange={(e) => setOverallComment(e.target.value)}
                    disabled={isLocked || saving || publishing}
                  />
                  <div className="text-xs text-gray-500">
                    {isLocked ? "Déjà publié : modification verrouillée." : "Visible côté élève/parent après publication."}
                  </div>
                </div>
              </div>

              {/* per question */}
              <div className="sn-card p-5 space-y-4">
                <div className="font-semibold">Correction par question</div>

                <div className="space-y-4">
                  {questions.map((q, idx) => {
                    const a = (answers[q.id] || "").trim();
                    const got = perQuestion[q.id]?.pointsAwarded;
                    const comment = perQuestion[q.id]?.comment || "";

                    return (
                      <div key={q.id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-500">
                              Question {idx + 1} • {q.points} pts • {q.type === "mcq" ? "QCM" : "Réponse ouverte"}
                            </div>
                            <div className="font-semibold text-gray-900">{q.prompt}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-xs text-gray-500">Points</div>
                            <input
                              className="w-20 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                              inputMode="decimal"
                              placeholder={`0-${q.points}`}
                              value={typeof got === "number" ? String(got) : ""}
                              onChange={(e) => setPoints(q.id, e.target.value, q.points)}
                              disabled={isLocked || saving || publishing}
                            />
                            <span className="text-xs text-gray-500">/ {q.points}</span>
                          </div>
                        </div>

                        {q.type === "mcq" ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {q.choices.map((c) => {
                              const selected = a === c;
                              const correct = q.correct && c === q.correct;

                              const base = "rounded-2xl border p-3 text-left";
                              const cls =
                                selected && correct
                                  ? "border-green-500 bg-green-50"
                                  : selected && !correct
                                  ? "border-red-300 bg-red-50"
                                  : !selected && correct
                                  ? "border-green-200 bg-green-50/40"
                                  : "border-gray-100 bg-white";

                              return (
                                <div key={c} className={`${base} ${cls}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm text-gray-900">{c}</div>
                                    <div className="flex gap-2">
                                      {correct && <span className="sn-badge sn-badge-green">Bonne</span>}
                                      {selected && <span className="sn-badge sn-badge-blue">Choisi</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                            {a ? a : <span className="text-gray-500">Aucune réponse.</span>}
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-gray-700">Commentaire enseignant</div>
                          <textarea
                            className="w-full min-h-[90px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="Ex: Bonne méthode, mais..."
                            value={comment}
                            onChange={(e) => setComment(q.id, e.target.value)}
                            disabled={isLocked || saving || publishing}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-gray-500">
                  *Démo : Enregistrer = Corrigé. Publier = visible élève/parent. Une fois publié, la copie est verrouillée.*
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
