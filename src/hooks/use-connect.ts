"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export default function useConnect() {
  const router = useRouter();

  return useCallback(
    (url: string, token: string) => {
      sessionStorage.setItem(
        "connection",
        JSON.stringify({
          url,
          token,
        })
      );

      router.push(`/client`);
    },
    [router]
  );
}
