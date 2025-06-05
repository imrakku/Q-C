import React from 'react';

interface HomeCardProps {
  title: string;
  description: string;
  icon: string; // Emoji or SVG string
}

const homeCardData: HomeCardProps[] = [
  {
    title: "Clustering (CCR)",
    description: "Pinpoint optimal dark store locations within the Chandigarh Capital Region using demand data and visualize service catchments.",
    icon: "🗺️"
  },
  {
    title: "Demand Profiles (CCR)",
    description: "Craft, store, and manage bespoke demand scenarios for CCR with spatial and temporal nuances. ✨ Features AI-driven parameter suggestions!",
    icon: "📊"
  },
  {
    title: "Simulation (CCR)",
    description: "Execute dynamic, interactive delivery simulations across CCR. Monitor KPIs in real-time and harness AI for operational insights.",
    icon: "🚀"
  },
  {
    title: "Workforce Optimization (CCR)",
    description: "Ascertain the ideal delivery agent count for CCR by simulating diverse scenarios and evaluating cost-service trade-offs.",
    icon: "⚙️"
  },
  {
    title: "Scenario Analysis (CCR)",
    description: "Archive and juxtapose outcomes from varied CCR simulation runs to bolster strategic logistical decisions.",
    icon: "🔍"
  }
];

const HomeCard: React.FC<HomeCardProps> = ({ title, description, icon }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-lg hover:shadow-slate-300/70 transition-shadow duration-300">
    <h3 className="text-xl font-bold text-slate-800 mb-3 flex items-center">
      <span className="text-2xl mr-2">{icon}</span>
      {title}
    </h3>
    <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
  </div>
);

const HomeSection: React.FC = () => {
  return (
    <section id="home" className="p-6 sm:p-8 bg-white rounded-xl shadow-xl mb-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-300">
        Welcome to the Simulator (Chandigarh Capital Region)
      </h2>
      <p className="text-lg text-slate-600 leading-relaxed mb-6">
        An advanced web-based platform for modeling, analyzing, and optimizing last-mile delivery operations. Now expanded for the wider Chandigarh Capital Region (CCR), including Chandigarh, Mohali, Panchkula, and Zirakpur.
      </p>
      <p className="text-slate-700 leading-relaxed mb-8">
        Explore our suite of interactive modules using the navigation above. Each module is designed to provide actionable, data-driven insights:
      </p>
      <div id="homePageCardsContainer" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-8">
        {homeCardData.map(card => (
          <HomeCard key={card.title} title={card.title} description={card.description} icon={card.icon} />
        ))}
      </div>
      <div className="mt-8 p-5 bg-slate-200 border border-slate-400 rounded-lg text-slate-700 shadow-md">
        <h3 className="text-lg font-semibold mb-2 text-slate-800">Important Note on AI Features:</h3>
        <p className="text-sm">
          The AI-driven analysis and suggestions within the Simulation and Workforce Optimization modules are powered by the Gemini API.
          These insights are intended for informational and supplementary purposes. Always combine AI outputs with your professional judgment and domain expertise for final decision-making.
        </p>
      </div>
    </section>
  );
};

export default HomeSection;
