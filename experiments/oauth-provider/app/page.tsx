export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <h1>TaskBoard OAuth testing</h1>
      <p>This is a separate authentication test service. It is not the TaskBoard application.</p>
      <p>Account signup is disabled outside disposable CI tests. Employee TaskBoard login is unchanged.</p>
    </main>
  );
}
