import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type SubmissionStatus = "in_progress" | "submitted" | "graded";
type AssessmentType = "quiz" | "assignment" | "exam";

type ProfileRow = {
  id: string;
  full_name: string | null;
};

type AssessmentRow = {
  id: string;
  title: string;
  type: AssessmentType;
  course_id: string;
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
};

type SubmissionRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  assessments:
    | AssessmentRow
    | AssessmentRow[]
    | null;
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

type StatusFilter = "all" | SubmissionStatus;

type Row = {
  submissionId: string;
  assessmentId: string;
  assessmentTitle: string;
  type: "Quiz" | "Devoir" | "Examen";
  className: string;
  attemptStatus: SubmissionStatus;
  submittedAtISO?: string | null;
  studentId: string;
  studentName: string;
  score?: string;
  courseTitle: string;
};

function normalizeAssessment(
  value: SubmissionRow["assessments"]
): AssessmentRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeCourse(
  value: AssessmentRow["courses"]
): { id: string; title: string } | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function typeBadge(type: Row["type"]) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusBadge(status: SubmissionStatus) {
  if (status === "graded") return "sn-badge sn-badge-green";
  if (status === "submitted") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusLabel(status: SubmissionStatus) {
  if (status === "in_progress") return "En cours";
  if (status === "submitted") return "À corriger";
  return "Corrigé";
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function orderStatus(s: SubmissionStatus) {
  if (s === "submitted") return 0;
  if (s === "graded") return 1;
  return 9;
}

function scoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined) return undefined;
  return String(score);
}

export default function TeacherGrading() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshISO, setLastRefreshISO] = useState<string>(() => new Date().toISOString());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("submitted");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!user || user.isDemo) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1) évaluations créées par cet enseignant
      const { data: teacherAssessmentsData, error: teacherAssessmentsError } = await supabase
        .from("assessments")
        .select("id")
        .eq("created_by", user.id);

      if (teacherAssessmentsError) throw teacherAssessmentsError;

      const assessmentIds = (teacherAssessmentsData ?? []).map((row) => row.id) as string[];

      if (assessmentIds.length === 0) {
        setRows([]);
        return;
      }

      // 2) soumissions liées + assessment + course
      const { data: submissionsData, error: submissionsError } = await supabase
        .from("submissions")
        .select(
          `
          id,
          assessment_id,
          student_id,
          submitted_at,
          status,
          score,
          feedback,
          assessments (
            id,
            title,
            type,
            course_id,
            courses (
              id,
              title
            )
          )
        `
        )
        .in("assessment_id", assessmentIds)
        .in("status", ["submitted", "graded"])
        .order("submitted_at", { ascending: false });

      if (submissionsError) throw submissionsError;

      const submissionRows = (submissionsData ?? []) as SubmissionRow[];
      const studentIds = Array.from(new Set(submissionRows.map((row) => row.student_id)));

      // 3) profils élèves
      let profilesById: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", studentIds);

        if (profilesError) throw profilesError;

        profilesById = ((profilesData ?? []) as ProfileRow[]).reduce<Record<string, string>>(
          (acc, row) => {
            acc[row.id] = row.full_name?.trim() || "Élève";
            return acc;
          },
          {}
        );
      }

      // 4) classes des élèves
      let classByStudentId: Record<string, string> = {};
      if (studentIds.length > 0) {
        const { data: classStudentsData, error: classStudentsError } = await supabase
          .from("class_students")
          .select("student_id, class_id")
          .in("student_id", studentIds);

        if (classStudentsError) throw classStudentsError;

        const classStudents = (classStudentsData ?? []) as ClassStudentRow[];
        const classIds = Array.from(new Set(classStudents.map((row) => row.class_id)));

        let classesById: Record<string, string> = {};

        if (classIds.length > 0) {
          const { data: classesData, error: classesError } = await supabase
            .from("classes")
            .select("id, name, school_year")
            .in("id", classIds);

          if (classesError) throw classesError;

          classesById = ((classesData ?? []) as ClassRow[]).reduce<Record<string, string>>(
            (acc, row) => {
              acc[row.id] = `${row.name} (${row.school_year})`;
              return acc;
            },
            {}
          );
        }

        classByStudentId = classStudents.reduce<Record<string, string>>((acc, row) => {
          acc[row.student_id] = classesById[row.class_id] ?? "Non assigné";
          return acc;
        }, {});
      }

      const mapped: Row[] = submissionRows
        .map((submission) => {
          const assessment = normalizeAssessment(submission.assessments);
          if (!assessment) return null;

          const course = normalizeCourse(assessment.courses);

          return {
            submissionId: submission.id,
            assessmentId: assessment.id,
            assessmentTitle: assessment.title,
            type: mapType(assessment.type),
            className: classByStudentId[submission.student_id] ?? "Non assigné",
            attemptStatus: submission.status,
            submittedAtISO: submission.submitted_at,
            studentId: submission.student_id,
            studentName: profilesById[submission.student_id] ?? "Élève",
            score: scoreLabel(submission.score),
            courseTitle: course?.title ?? "Cours",
          };
        })
        .filter((row): row is Row => Boolean(row))
        .sort((a, b) => {
          const w = orderStatus(a.attemptStatus) - orderStatus(b.attemptStatus);
          if (w !== 0) return w;

          const ta = a.submittedAtISO ? new Date(a.submittedAtISO).getTime() : 0;
          const tb = b.submittedAtISO ? new Date(b.submittedAtISO).getTime() : 0;
          return tb - ta;
        });

      setRows(mapped);
      setLastRefreshISO(new Date().toISOString());
    } catch (err) {
      console.error("[TeacherGrading] loadRows error:", err);
      setError("Impossible de charger les copies à corriger.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadRows();
  }, [authLoading, loadRows, refreshKey]);

  const counts = useMemo(() => {
    const c: Record<SubmissionStatus, number> = {
      in_progress: 0,
      submitted: 0,
      graded: 0,
    };
    for (const row of rows) c[row.attemptStatus] += 1;
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.attemptStatus !== statusFilter) return false;
      if (!q) return true;

      const hay = `${row.studentName} ${row.studentId} ${row.assessmentTitle} ${row.className} ${row.courseTitle}`
        .toLowerCase()
        .trim();

      return hay.includes(q);
    });
  }, [rows, statusFilter, query]);

  const total = counts.submitted + counts.graded + counts.in_progress;
  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Corrections</div>
          <div className="text-sm text-gray-500">
            Copies soumises → corriger.
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Dernière mise à jour : {formatDate(lastRefreshISO)}
          </div>
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => setRefreshKey((k) => k + 1)}
          type="button"
        >
          ↻ Rafraîchir
        </button>
      </div>

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
            <div className="text-xs text-gray-600">En cours</div>
            <div className="text-lg font-bold text-gray-900">⏳ {counts.in_progress}</div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="text-xs text-gray-600">Total</div>
            <div className="text-lg font-bold text-gray-900">{total}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full sm:w-80 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Rechercher (élève, éval, classe, cours)…"
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
          </div>
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les copies réelles ne sont pas chargées.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-4 w-1/4 rounded bg-gray-100" />
              <div className="h-10 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && filteredRows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredRows.map((row) => {
            const primaryLabel = row.attemptStatus === "submitted" ? "Corriger" : "Ouvrir";

            return (
              <div key={row.submissionId} className="sn-card sn-card-hover p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-gray-900">{row.studentName}</div>
                      <span className="sn-badge sn-badge-gray">{row.className}</span>
                      <span className={typeBadge(row.type)}>{row.type}</span>
                      <span className={statusBadge(row.attemptStatus)}>
                        {statusLabel(row.attemptStatus)}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-gray-500">{row.assessmentTitle}</div>
                    <div className="mt-1 text-sm text-gray-500">{row.courseTitle}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Soumis : {formatDate(row.submittedAtISO)}
                    </div>
                  </div>

                  {row.score && <span className="sn-badge sn-badge-green">{row.score}</span>}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    className="sn-btn-primary sn-press"
                    onClick={() =>
                      navigate(
                        `/app/teacher/grading/${row.assessmentId}?studentId=${encodeURIComponent(
                          row.studentId
                        )}`
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
      )}

      {!isLoading && !error && filteredRows.length === 0 && (
        <div className="sn-card p-6 text-sm text-gray-600">
          Aucune copie trouvée. Fais soumettre une évaluation côté apprenant, ou change le filtre.
        </div>
      )}
    </div>
  );
}