import { github, lucia } from "@/lib/auth";
import { cookies, headers } from "next/headers";
import { OAuth2RequestError } from "arctic";
import { generateId } from "lucia";
import { db } from "@/db";
import { user, user_oauth } from "@/db/schema";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const headerStore = headers();
  const GITHUB_API_URL = "https://api.github.com";

  const storedState = cookies().get("github_oauth_state")?.value ?? null;
  if (!code || !state || !storedState || state !== storedState) {
    return new Response(null, {
      status: 400,
    });
  }

  try {
    const token = await github.validateAuthorizationCode(code);
    const githubUserResponse = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    });
    const githubUser: GitHubUser = await githubUserResponse.json();

    if (githubUser.email === null) {
      const resp = await fetch(`${GITHUB_API_URL}/user/emails`, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      });
      const githubEmails: GitHubEmail[] = await resp.json();
      githubUser.email =
        githubEmails.find((email) => email.primary)?.email || null;
    }

    // Replace this with your own DB client.
    const existingUser = await db.query.user_oauth.findFirst({
      where: (field, op) =>
        op.and(
          op.eq(field.provider, "GITHUB"),
          op.eq(field.providerId, githubUser.id)
        ),
    });

    if (existingUser?.userId) {
      const session = await lucia.createSession(existingUser.userId, {
        auth_id: existingUser.id,
        user_agent: headerStore.get("user-agent"),
      });

      const sessionCookie = lucia.createSessionCookie(session.id);

      cookies().set(
        sessionCookie.name,
        sessionCookie.value,
        sessionCookie.attributes
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/connect",
        },
      });
    }

    const userId = generateId(15);
    const authId = generateId(15);

    await db
      .insert(user)
      .values({ id: userId, name: githubUser.login, email: githubUser.email });
    await db.insert(user_oauth).values({
      id: authId,
      provider: "GITHUB",
      providerId: githubUser.id,
      userId: userId,
    });

    const session = await lucia.createSession(userId, {
      auth_id: userId,
      user_agent: headerStore.get("user-agent"),
    });

    const sessionCookie = lucia.createSessionCookie(session.id);

    cookies().set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
      },
    });
  } catch (e) {
    console.error(e);
    // the specific error message depends on the provider
    if (e instanceof OAuth2RequestError) {
      // invalid code
      return new Response(null, {
        status: 400,
      });
    }
    return new Response(null, {
      status: 500,
    });
  }
}

interface GitHubUser {
  id: string;
  login: string;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: "public" | "private";
}
