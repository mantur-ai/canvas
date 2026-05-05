import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "use-intl";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { routing } from "@/i18n/routing";
import { Toaster } from "sonner";
import { OnboardingGuard } from "@/components/onboarding/onboarding-guard";
import { ProjectBootstrap } from "@/components/project/project-bootstrap";


export function generateStaticParams() {
  return routing.locales.map((locale) => ({ lang: locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;

  if (!hasLocale(routing.locales, lang)) {
    return {};
  }

  const t = await getTranslations({ locale: lang, namespace: "Metadata" });
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: lang,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `/${locale}`]),
      ),
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;

  if (!hasLocale(routing.locales, lang)) {
    notFound();
  }

  setRequestLocale(lang);
  const messages = await getMessages();

  return (
    <html
      lang={lang}
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="h-screen w-screen flex flex-col">
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <Toaster position="top-center" theme="dark" />
            <ProjectBootstrap />
            <OnboardingGuard />
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
