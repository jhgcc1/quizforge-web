import { UserMenu } from "@/components/UserMenu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/app">Quiz<span>Forge</span></a>
        <UserMenu />
      </header>
      {children}
    </div>
  );
}
