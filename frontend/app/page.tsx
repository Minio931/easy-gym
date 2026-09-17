import { redirect } from "next/navigation";

/** Wejście w "/" zawsze ląduje na pulpicie; guard przerzuci na logowanie,
 * jeśli nie ma sesji. */
export default function RootPage() {
  redirect("/pulpit");
}
