import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "use-intl";
import { CanvasWorkspace } from "@/components/canvas/workspace";
import { VideoFooter } from "@/components/layout/video-footer";
import { routing } from "@/i18n/routing";
import Header from "@/components/layout/Header";
import Siderbar from "@/components/layout/siderbar";

export default async function HomePage({
  params,
}: PageProps<"/[lang]">) {
  const { lang } = await params;

  if (!hasLocale(routing.locales, lang)) {
    notFound();
  }

  setRequestLocale(lang);

  return (
    <div id="root" className="h-screen w-screen flex flex-col">

      <Header />
      <Siderbar />
      <main className="flex-1 overflow-hidden ">
        <CanvasWorkspace />
      </main>
      <footer>
        <VideoFooter />
      </footer>
    </div>

  );
}
