import { redirect } from "next/navigation";

/** Entry at "/" always lands on the dashboard; the guard will bounce to
 * the login screen if there is no session. */
export default function RootPage() {
  redirect("/pulpit");
}
