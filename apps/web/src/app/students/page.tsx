import { homePathFor } from "@/lib/permissions";
import { isStaff } from "@/lib/permissions";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ageFrom, type Student } from "@/lib/students";
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
            <li key={student.id}>
              <Link href={`/students/${student.id}`}>{student.full_name}</Link> — age{" "}
              {ageFrom(student.date_of_birth)} — {student.status}
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
