import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const spaces = [
  {
    slug: "office",
    title: "Office",
    blurb: "Embed the prototype as the office view for the team.",
  },
  {
    slug: "floor",
    title: "Floor",
    blurb: "Reuse the same prototype for the wider floor experience.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
      <section className="space-y-4 text-center sm:text-left">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Seasoning Liquids Journal
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Prototype staging hub
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Use the links below to mount the Canvas prototype in different contexts. Each route renders the same host component so you can drop your embed once and iterate quickly.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {spaces.map((space) => (
          <Card key={space.slug} className="h-full">
            <CardHeader>
              <CardTitle>{space.title}</CardTitle>
              <CardDescription>{space.blurb}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="mt-2">
                <Link href={`/${space.slug}`}>
                  Open {space.title}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="mt-auto text-sm text-muted-foreground">
        Wire your prototype in <code className="rounded bg-muted px-1 py-0.5">src/app/(ui)/prototype/page.tsx</code> and it will appear on both routes.
      </footer>
    </main>
  );
}
