import { computeBuilderScores } from '../src/lib/talent/matching';
import { evaluateDeterministicQuality } from '../src/lib/talent/profileQuality';

// Mock Builder document
const mockBuilder = {
  name: 'John Doe',
  email: 'john@example.com',
  headline: 'Product Engineer skilled in React & Mobile Apps',
  bio: 'A passionate developer who shipped multiple Flutter applications and full-stack SaaS projects. I have extensive experience with Firebase, Node.js, and SQL databases.',
  rolePreference: ['Full-stack Developer', 'Mobile Engineer'],
  preferredWorkType: ['full_time', 'paid_sprint'],
  availability: {
    availableNow: true,
    hoursPerWeek: 40,
    remotePreference: 'remote'
  },
  links: {
    github: 'https://github.com/johndoe',
    linkedin: 'https://linkedin.com/in/johndoe'
  },
  verificationStatus: 'builder_confirmed'
};

// Mock Projects
const mockProjects = [
  {
    projectName: 'MedPal Healthcare App',
    description: 'A healthcare messaging and tracker app built in Flutter.',
    techStack: ['Flutter', 'Firebase', 'Dart'],
    builderContribution: 'Created the mobile frontend from scratch and configured Firebase real-time database.',
    verificationStatus: 'admin_verified',
    links: {
      github: 'https://github.com/johndoe/medpal',
      demo: 'https://medpal.example.com'
    }
  },
  {
    projectName: 'Restaurant Ad Optimizer',
    description: 'A marketing dashboard for generating automated restaurant ads.',
    techStack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    builderContribution: 'Designed and built the ads analytics dashboard and postgres DB integrations.',
    verificationStatus: 'builder_confirmed',
    links: {
      github: 'https://github.com/johndoe/restaurant-ads'
    }
  }
];

console.log('=== Running Local Pivot Scoring Tests ===');

// 1. Completion & Proof Scores
const scores = computeBuilderScores(mockBuilder, mockProjects);
console.log('Profile Completion Score:', scores.profileScore);
console.log('Profile Completion Label:', scores.profileCompletionLabel);
console.log('Proof Strength Score:', scores.proofScore);
console.log('Proof Strength Label:', scores.proofStrengthLabel);

// 2. Profile Quality & Clarity Scores
const quality = evaluateDeterministicQuality(mockBuilder, mockProjects);
console.log('Quality Score:', quality.overallScore);
console.log('Quality Label (Clarity Overall):', quality.label);
console.log('Founder Clarity Score:', quality.founderClarity.score);
console.log('Founder Clarity Label:', quality.founderClarity.label);

if (
  scores.profileCompletionLabel === 'Complete' &&
  scores.proofStrengthLabel === 'Verified Proof' &&
  quality.label === 'Strong' &&
  quality.founderClarity.label === 'Understandable'
) {
  console.log('\n✅ All new strategic labels computed and matched successfully!');
} else {
  console.log('\n❌ Label mismatch. Labels found:', {
    completion: scores.profileCompletionLabel,
    proof: scores.proofStrengthLabel,
    quality: quality.label,
    clarity: quality.founderClarity.label
  });
}
