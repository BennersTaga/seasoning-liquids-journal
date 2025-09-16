import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-6">
      <Card className="w-full">
        <CardContent className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-xl font-semibold text-foreground">Prototype placeholder</h2>
          <p className="max-w-prose text-muted-foreground">
            Paste prototype here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
