import {getRequestConfig} from "next-intl/server";
import {hasLocale} from "use-intl";
import {routing} from "./routing";

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  let messages: Record<string, unknown>;

  try {
    messages = (await import(`../messages/${locale}.json`)).default;
  } catch {
    messages = (await import(`../messages/${routing.defaultLocale}.json`)).default;
  }

  return {
    locale,
    messages,
  };
});
