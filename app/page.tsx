import Sidebar from "@/components/Sidebar";
import Hangman from "@/components/Hangman";

export default function Home() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="stage">
        <Hangman />
      </main>
    </div>
  );
}
