import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ageFrom, studentStatuses, type Student } from "@/lib/students";
import { canManageCondos } from "@/lib/permissions";
import { getCurrentProfile } from "@/lib/staff";
import { createServerSupabase } from "@/lib/supabase-server";

async function StudentList() {
  await connection();
  const supabase = await createServerSupabase();
  const me = await getCurrentProfile(supabase);
  if (!me) {
    redirect("/login");
  }
  if (!isStaff(me.role)) {
    redirect(homePathFor(me.role));
  }

  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, date_of_birth, status, current_level")
    .order("full_name");
  if (error) {
    return <p>Could not load students: {error.message}</p>;
  }

  const students = (data ?? []) as Pick<Student, "id" | "full_name" | "date_of_birth" | "status" | "current_level">[];
  return (
    <>
      {canManageCondos(me.role) && (
        <p>
          <Link href="/students/new">Add student</Link>
        </p>
      )}
      {students.length === 0 ? (
        <p>No students you can see.</p>
      ) : (
        <ul>
          {students.map((student) => (
            <li key={student.id} className="table-row">
              <Link href={`/students/${student.id}`}>{student.full_name}</Link>
              <span className="chip">Age {ageFrom(student.date_of_birth)}</span>
              {canManageCondos(me.role) && (
                <span className={`status-badge status-${student.status}`}>
                  {studentStatuses.find((status) => status.value === student.status)?.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StudentsPage() {
  return (
    <main>
      <h1>Students</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <StudentList />
      </Suspense>
    </main>
  );
}
