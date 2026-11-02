import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const Game = lazy(() => import("../game/Game"));

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Open World Prototype" },
      { name: "description", content: "A vast low-poly open world with hills, towns, a city, mountains and ocean." },
      { property: "og:title", content: "Open World Prototype" },
      { property: "og:description", content: "Explore a vast low-poly open world." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Suspense fallback={<div className="h-screen w-screen bg-background" />}>
      <Game />
    </Suspense>
  ),
});
