import zod from "zod";
import withUser from "@/lib/with-user";
import { db } from "@/db";
import { generateId } from "lucia";
import { database, database_role, database_user_role } from "@/db/schema";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { encrypt } from "@/lib/encryption";
import { SavedConnectionItem } from "@/app/connect/saved-connection-storage";

const databaseSchema = zod.object({
  name: zod.string().min(3).max(50),
  description: zod.string(),
  label: zod.enum(["gray", "red", "yellow", "green", "blue"]),
  driver: zod.enum(["turso"]),
  config: zod.object({
    url: zod.string().min(5),
    token: zod.string(),
  }),
});

export const POST = withUser(async ({ user, req }) => {
  const body = await req.json();
  const parsed = databaseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.formErrors,
      },
      { status: 500 }
    );
  }

  const data = parsed.data;
  const databaseId = generateId(15);
  const ownerRoleId = generateId(15);
  const editorRole = generateId(15);
  const now = Date.now();

  const key = Buffer.from(env.ENCRYPTION_KEY, "base64");

  try {
    await db.batch([
      db.insert(database).values({
        id: databaseId,
        userId: user.id,
        color: data.label,
        createdAt: now,
        description: data.description,
        driver: data.driver,
        name: data.name,
        host: data.config.url,
        token: encrypt(key, data.config.token),
      }),

      db.insert(database_role).values({
        id: ownerRoleId,
        databaseId,
        name: "Owner",
        canExecuteQuery: 1,
        isOwner: 1,
        createdAt: now,
        createdBy: user.id,
        updatedAt: now,
        updatedBy: user.id,
      }),

      db.insert(database_role).values({
        id: editorRole,
        databaseId,
        name: "Editor",
        canExecuteQuery: 1,
        isOwner: 0,
        createdAt: Date.now(),
        createdBy: user.id,
        updatedAt: Date.now(),
        updatedBy: user.id,
      }),

      db.insert(database_user_role).values({
        databaseId,
        roleId: ownerRoleId,
        createdAt: Date.now(),
        createdBy: user.id,
        userId: user.id,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        id: databaseId,
        name: data.name,
        label: data.label,
        description: data.description,
        storage: "remote",
      } as SavedConnectionItem,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
    });
  }
});
