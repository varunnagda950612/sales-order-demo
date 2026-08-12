import { cookies } from "next/headers";
import { localSessionCookieName, parseLocalProfile } from "./local-session";

export async function getLocalServerProfile() {
  const cookieStore = await cookies();
  return parseLocalProfile(cookieStore.get(localSessionCookieName)?.value);
}
