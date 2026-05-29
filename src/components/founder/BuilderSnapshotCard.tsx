import React from 'react';
import type { FullCandidate, AnonymousCandidate } from './founderTypes';
import { Zap, ShieldCheck, Check, Heart, Ban, AlertCircle, ArrowUpRight } from 'lucide-react';

function getMetricColor(value: string) {
  const v = value.toLowerCase();
  if (v.includes('complete') || v.includes('verified') || v.includes('standout') || v.includes('strong') || v.includes('founder-friendly')) {
    return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300';
  }
  if (v.includes('mostly') || v.includes('solid') || v.includes('understandable') || v.includes('basic') || v.includes('sharpening')) {
    return 'bg-amber-500/10 border-amber-500/20 text-amber-300';
  }
  return 'bg-red-500/10 border-red-500/20 text-red-300';
}

function matchLabelTone(label: string) {
  if (label === 'Strong Match') return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10';
  if (label === 'Good Match') return 'text-amber-200 border-amber-500/20 bg-amber-500/10';
  return 'text-white/80 border-white/20 bg-white/10';
}

interface BuilderSnapshotCardProps {
  candidate: FullCandidate | AnonymousCandidate | any;
  unlocked: boolean;
  onViewDetails: () => void;
  onRequestIntro?: () => void;
  onUnlock?: () => void;
  onSave?: () => void;
  onHide?: () => void;
  actionBusy?: boolean;
}

export default function BuilderSnapshotCard({
  candidate,
  unlocked,
  onViewDetails,
  onRequestIntro,
  onUnlock,
  onSave,
  onHide,
  actionBusy,
}: BuilderSnapshotCardProps) {
  const isAnon = !unlocked;
  
  // Extract or generate interesting fact
  const getInterestingFact = () => {
    if (candidate.proofSummary) {
      return candidate.proofSummary.replace(/\*\*|`/g, '');
    }
    if (candidate.whyTheyMatch) {
      return candidate.whyTheyMatch;
    }
    return "Built a standout project in a recent hackathon.";
  };

  // Safe checks for arrays and properties
  const skills = Array.isArray(candidate.topSkills) ? candidate.topSkills : [];
  const name = isAnon ? candidate.anonymousLabel : candidate.name;
  const headline = isAnon ? (candidate.roleType || 'Builder') : (candidate.headline || 'Builder');
  const matchLabel = candidate.matchLabel || 'Possible Match';

  // Metrics (Axes of proof)
  const profileCompletion = candidate.profileCompletionLabel || (candidate.profileCompletion?.label) || 'Mostly Filled';
  const founderClarity = candidate.founderClarityLabel || (candidate.profileQuality?.founderClarityLabel) || 'Understandable';
  const proofStrength = candidate.proofStrengthLabel || (candidate.profileQuality?.proofStrengthLabel) || 'Solid Proof';

  return (
    <div className="group rounded-3xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-6 flex flex-col justify-between transition-all duration-300 hover:border-[#fa7d22]/30 shadow-lg hover:shadow-[#fa7d22]/5">
      <div className="space-y-4">
        
        {/* Name/Label & Match Grade */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-semibold text-lg text-white truncate">{name}</h4>
            <p className="text-sm text-[#fa7d22] font-medium truncate">{headline}</p>
            {candidate.location && !isAnon && (
              <p className="text-xs text-white/40 mt-0.5">{candidate.location}</p>
            )}
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${matchLabelTone(matchLabel)}`}>
            {matchLabel}
          </span>
        </div>

        {/* Axis Badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          <div className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-semibold ${getMetricColor(profileCompletion)}`}>
            Completion: {profileCompletion}
          </div>
          <div className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-semibold ${getMetricColor(founderClarity)}`}>
            Clarity: {founderClarity}
          </div>
          <div className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-semibold ${getMetricColor(proofStrength)}`}>
            Proof: {proofStrength}
          </div>
        </div>

        {/* Pitch / Interesting Fact Box */}
        <div className="rounded-2xl bg-gradient-to-r from-[#fa7d22]/10 to-transparent p-4 border-l-2 border-[#fa7d22]">
          <p className="text-[10px] uppercase tracking-wider text-[#ffb580] font-bold flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3.5 h-3.5 fill-[#ffb580]" />
            Why They Fit
          </p>
          <p className="text-sm text-white/90 leading-relaxed font-medium">
            {getInterestingFact()}
          </p>
        </div>

        {/* Top Skills Chips */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {skills.slice(0, 5).map((skill: string) => (
              <span
                key={skill}
                className="px-2 py-0.5 rounded-md text-xs bg-white/5 border border-white/5 text-white/70"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
        
        {/* Short bio if unlocked */}
        {!isAnon && candidate.bio && (
          <p className="text-xs text-white/60 line-clamp-2 leading-relaxed pt-1">
            {candidate.bio}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-white/5 text-xs">
        {isAnon ? (
          <>
            <button
              onClick={onViewDetails}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold transition"
            >
              Preview
            </button>
            <button
              onClick={onUnlock}
              disabled={actionBusy}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#fa7d22] text-black font-bold hover:bg-[#ff9b4e] transition flex items-center justify-center gap-1 shadow-md shadow-[#fa7d22]/10"
            >
              Unlock Profile
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onViewDetails}
              className="flex-1 py-2 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-semibold transition text-center"
            >
              Explore Profile
            </button>
            {onRequestIntro && (
              <button
                onClick={onRequestIntro}
                disabled={actionBusy || candidate.introRequested}
                className="flex-1 py-2 px-3 rounded-xl bg-[#fa7d22] text-black font-bold hover:bg-[#ff9b4e] transition disabled:opacity-50"
              >
                {candidate.introRequested ? 'Intro requested' : 'Request Intro'}
              </button>
            )}
            
            {/* Save/Hide small utility buttons */}
            <div className="flex gap-1 shrink-0">
              {onSave && (
                <button
                  onClick={onSave}
                  disabled={actionBusy}
                  className={`p-2 rounded-xl border transition ${
                    candidate.saved
                      ? 'border-[#fa7d22]/40 bg-[#fa7d22]/10 text-[#ffb580]'
                      : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
                  }`}
                  title="Save Candidate"
                >
                  <Heart className={`w-4 h-4 ${candidate.saved ? 'fill-[#ffb580]' : ''}`} />
                </button>
              )}
              {onHide && (
                <button
                  onClick={onHide}
                  disabled={actionBusy}
                  className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/40 hover:text-white/60 hover:border-white/20 transition"
                  title="Hide Candidate"
                >
                  <Ban className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
