import Header from "@/app/components/header";
import ChatSection from "./components/chat-section";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24 background-gradient">
      <Header />
      <ChatSection />
      <img
        src="/EU_logo.png"
        alt="EU logo"
        className="h-12 w-auto"
      />
    </main>
  );
}
