import ScoringClient from "./ScoringClient";

export default function ScoringPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Run Scoring</h1>
        <p>Trigger the ML inference job to generate late-delivery predictions for unfulfilled orders.</p>
      </div>
      <ScoringClient />
    </div>
  );
}
