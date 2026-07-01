import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { createSession, updateSessionRadiant, getSession } from "~/utils/playground.server";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  let sessionId = formData.get("sessionId")?.toString();

  const modelName = formData.get("modelName")?.toString() || "User";
  const endpointName = formData.get("endpointName")?.toString() || "getUsers";
  const returnCode = formData.get("returnCode")?.toString() || "{ message: 'Hello World' }";

  const radiantCode = `
model ${modelName} {
  id: uuid @id @default(uuid())
  createdAt: datetime @default(now())
}

endpoint ${endpointName} {
  method: "GET"
  path: "/api/${endpointName.toLowerCase()}"
  handler: (req) => {
    return ${returnCode}
  }
}
  `.trim();

  if (!sessionId || !getSession(sessionId)) {
    sessionId = await createSession();
  }
  
  await updateSessionRadiant(sessionId, radiantCode);

  return json({ sessionId, success: true });
}

export default function PlaygroundIndex() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30 * 60);
  const [testResult, setTestResult] = useState<string>("");
  const isUpdating = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.sessionId) {
      setSessionId(actionData.sessionId);
    }
  }, [actionData]);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSessionId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const handleTest = async (endpointName: string) => {
    if (!sessionId) return;
    setTestResult("Executing...");
    try {
      const res = await fetch(`/api/proxy/${sessionId}/api/${endpointName.toLowerCase()}`);
      const text = await res.text();
      try {
        setTestResult(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setTestResult(text);
      }
    } catch (e) {
      setTestResult("Error fetching: " + String(e));
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isUrgent = timeLeft < 300; // Less than 5 minutes

  return (
    <div className="playground-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;700&family=Rajdhani:wght@500;600;700&family=Manrope:wght@400;500;600&display=swap');

        :root {
          --bg-color: #030305;
          --surface-color: #0a0a0f;
          --border-color: #1f1f2e;
          --accent-cyan: #00f0ff;
          --accent-purple: #8a2be2;
          --text-main: #f8f8f8;
          --text-muted: #8b8b9f;
          --danger: #ff2a2a;
          
          --font-display: 'Rajdhani', sans-serif;
          --font-ui: 'Manrope', sans-serif;
          --font-mono: 'Fira Code', monospace;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background-color: var(--bg-color);
          color: var(--text-main);
          font-family: var(--font-ui);
          line-height: 1.5;
          min-height: 100vh;
          background-image: 
            radial-gradient(circle at 15% 50%, rgba(138, 43, 226, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 30%, rgba(0, 240, 255, 0.08) 0%, transparent 50%);
          background-attachment: fixed;
          overflow-x: hidden;
        }

        /* Subtle grain overlay */
        body::before {
          content: "";
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          opacity: 0.03;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        .playground-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 60px 20px;
          position: relative;
          z-index: 1;
        }

        header {
          margin-bottom: 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 20px;
        }

        h1 {
          font-family: var(--font-display);
          font-size: 3rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          background: linear-gradient(90deg, #fff, var(--text-muted));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
        }

        .subtitle {
          color: var(--accent-cyan);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .timer-display {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(0, 240, 255, 0.05);
          border: 1px solid rgba(0, 240, 255, 0.2);
          padding: 10px 20px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 1.25rem;
          color: var(--accent-cyan);
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.05);
        }

        .timer-display.urgent {
          color: var(--danger);
          border-color: rgba(255, 42, 42, 0.4);
          background: rgba(255, 42, 42, 0.05);
          animation: pulse-danger 2s infinite;
        }

        @keyframes pulse-danger {
          0% { box-shadow: 0 0 0 rgba(255, 42, 42, 0); }
          50% { box-shadow: 0 0 20px rgba(255, 42, 42, 0.2); }
          100% { box-shadow: 0 0 0 rgba(255, 42, 42, 0); }
        }

        .bomb-icon {
          font-size: 1.1em;
        }
        
        .urgent .bomb-icon {
          animation: shake 0.5s infinite;
        }

        @keyframes shake {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          50% { transform: rotate(0deg); }
          75% { transform: rotate(10deg); }
          100% { transform: rotate(0deg); }
        }

        .grid-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
        }

        @media (max-width: 768px) {
          .grid-layout {
            grid-template-columns: 1fr;
          }
          header {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
          }
        }

        .panel {
          background: var(--surface-color);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 30px;
          position: relative;
          overflow: hidden;
        }

        /* Tech corner accents */
        .panel::before, .panel::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          border: 1px solid var(--accent-purple);
          opacity: 0.5;
          pointer-events: none;
        }
        .panel::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
        .panel::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }

        .panel h3 {
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: #fff;
          margin-bottom: 25px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .panel h3::before {
          content: '';
          display: block;
          width: 8px;
          height: 8px;
          background: var(--accent-purple);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-purple);
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        input[type="text"], textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          color: var(--accent-cyan);
          font-family: var(--font-mono);
          font-size: 0.9rem;
          padding: 12px 15px;
          border-radius: 4px;
          outline: none;
          transition: all 0.2s ease;
        }

        textarea {
          resize: vertical;
          min-height: 120px;
        }

        input[type="text"]:focus, textarea:focus {
          border-color: var(--accent-cyan);
          background: rgba(0, 240, 255, 0.05);
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.1);
        }

        .btn-primary {
          background: transparent;
          color: #fff;
          border: 1px solid var(--accent-purple);
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 15px 30px;
          width: 100%;
          border-radius: 4px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          z-index: 1;
        }

        .btn-primary::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 0%; height: 100%;
          background: var(--accent-purple);
          transition: all 0.3s ease;
          z-index: -1;
        }

        .btn-primary:hover::before {
          width: 100%;
        }

        .btn-primary:hover {
          box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-primary:disabled::before {
          display: none;
        }

        /* Test Panel specific */
        .terminal {
          background: #000;
          border: 1px solid #1a1a24;
          border-radius: 6px;
          margin-top: 20px;
          overflow: hidden;
        }

        .terminal-header {
          background: #111;
          padding: 8px 15px;
          display: flex;
          gap: 6px;
          border-bottom: 1px solid #1a1a24;
        }

        .terminal-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #333;
        }
        .terminal-dot:nth-child(1) { background: #ff5f56; }
        .terminal-dot:nth-child(2) { background: #ffbd2e; }
        .terminal-dot:nth-child(3) { background: #27c93f; }

        .terminal-body {
          padding: 20px;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          color: #a3a3a3;
          min-height: 150px;
          max-height: 400px;
          overflow-y: auto;
          line-height: 1.6;
        }

        .terminal-body .output-success {
          color: var(--accent-cyan);
        }

        .test-btn {
          background: rgba(0, 240, 255, 0.1);
          color: var(--accent-cyan);
          border: 1px solid var(--accent-cyan);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: uppercase;
        }

        .test-btn:hover {
          background: var(--accent-cyan);
          color: #000;
          box-shadow: 0 0 15px rgba(0, 240, 255, 0.4);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          text-align: center;
          gap: 15px;
        }

        .empty-state-icon {
          font-size: 2.5rem;
          opacity: 0.2;
        }
      `}} />

      <header>
        <div>
          <div className="subtitle">Interactive Environment</div>
          <h1>Radiant Playground</h1>
        </div>
        
        {sessionId && (
          <div className={`timer-display ${isUrgent ? 'urgent' : ''}`}>
            <span>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>
            <span className="bomb-icon">💣</span>
          </div>
        )}
      </header>

      <div className="grid-layout">
        {/* Left Column: Form Builder */}
        <div className="panel">
          <h3>Architecture Config</h3>
          
          <form 
            method="post" 
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget, { replace: true });
            }}
          >
            <input type="hidden" name="sessionId" value={sessionId || ""} />
            
            <div className="form-group">
              <label>Model Identity</label>
              <input type="text" name="modelName" defaultValue="User" required spellCheck="false" />
            </div>

            <div className="form-group">
              <label>Endpoint Route Name</label>
              <input type="text" name="endpointName" defaultValue="getUsers" required spellCheck="false" />
            </div>

            <div className="form-group">
              <label>Handler Return JSON</label>
              <textarea name="returnCode" defaultValue="{ message: 'Hello from the backend!' }" required spellCheck="false" />
            </div>

            <button type="submit" className="btn-primary" disabled={isUpdating}>
              {isUpdating ? "Initializing..." : (sessionId ? "Update Instance" : "Deploy Instance")}
            </button>
          </form>
        </div>

        {/* Right Column: Test Panel */}
        <div className="panel">
          <h3>Test Execution</h3>
          
          {sessionId ? (
            <div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "20px" }}>
                Target instance is active. Execute queries against the proxied endpoint.
              </p>
              
              <button 
                type="button"
                className="test-btn"
                onClick={() => {
                  const form = document.querySelector('form');
                  const formData = new FormData(form as HTMLFormElement);
                  handleTest(formData.get('endpointName') as string);
                }} 
              >
                Execute GET Request
              </button>
              
              <div className="terminal">
                <div className="terminal-header">
                  <div className="terminal-dot"></div>
                  <div className="terminal-dot"></div>
                  <div className="terminal-dot"></div>
                </div>
                <div className="terminal-body">
                  {testResult ? (
                    <span className="output-success">{testResult}</span>
                  ) : (
                    <span style={{ opacity: 0.5 }}>$ awaiting execution command...</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">⚡</div>
              <p>Deploy a playground instance to enable the testing terminal.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
