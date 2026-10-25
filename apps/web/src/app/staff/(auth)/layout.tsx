import { Logo } from "@/components/app/logo";

/** Staff sign-in pages: one narrow column, on a white card from 640 px. */
export default function StaffAuthLayout({ children }: LayoutProps<"/staff">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-6 sm:justify-center sm:py-12">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        <Logo href="/staff/login" variant="stacked" height={96} />
        {children}
      </div>
    </div>
  );
}
