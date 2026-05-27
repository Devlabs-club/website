import type { APIRoute } from 'astro';
import { connectDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import EventRecord from '@/models/talent/EventRecord';
import ProjectRecord from '@/models/talent/ProjectRecord';
import ContributionRecord from '@/models/talent/ContributionRecord';
import { deterministicBuilderMatch, type DeterministicMatchMethod } from '@/lib/talent/matching';

const ACCEPTED_METHODS = new Set<DeterministicMatchMethod>(['email_exact', 'full_name_unique', 'first_last_unique']);

type ImportRow = {
  eventName?: string;
  projectTitle?: string;
  submissionUrl?: string;
  videoDemoLink?: string;
  imageGalleryUrls?: string;
  submitterEmail?: string;
  submitterFirstName?: string;
  submitterLastName?: string;
  contribution?: string;
  techStack?: string[] | string;
};

function parseTechStack(value: string[] | string | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value.split(/[|,]/).map((item) => item.trim()).filter(Boolean);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await connectDB();
    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const dryRun = Boolean(body?.dryRun);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'rows array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accepted: any[] = [];
    const excluded: any[] = [];

    for (const row of rows) {
      const match = await deterministicBuilderMatch({
        email: row.submitterEmail,
        firstName: row.submitterFirstName,
        lastName: row.submitterLastName,
        fullName: [row.submitterFirstName, row.submitterLastName].filter(Boolean).join(' '),
      });

      const normalized = {
        eventName: row.eventName || 'Unknown Event',
        projectTitle: row.projectTitle || 'Untitled Project',
        submissionUrl: row.submissionUrl || null,
        videoDemoLink: row.videoDemoLink || null,
        imageGalleryUrls: row.imageGalleryUrls || null,
        submitterName: [row.submitterFirstName, row.submitterLastName].filter(Boolean).join(' ').trim() || null,
        submitterEmail: row.submitterEmail || null,
        contribution: row.contribution || null,
        techStack: parseTechStack(row.techStack),
        matchMethod: match.method,
        confidence: match.confidence,
      };

      if (!match.builder || !ACCEPTED_METHODS.has(match.method as DeterministicMatchMethod)) {
        excluded.push({ ...normalized, reason: 'non_deterministic_or_unmatched' });
        continue;
      }

      accepted.push({ ...normalized, builderId: String(match.builder._id), builderName: match.builder.name });

      if (!dryRun) {
        const builder = await BuilderProfile.findById(match.builder._id);
        if (!builder) continue;

        const event = await EventRecord.findOneAndUpdate(
          { name: normalized.eventName, date: new Date('2026-01-01') },
          {
            $setOnInsert: {
              name: normalized.eventName,
              date: new Date('2026-01-01'),
              type: 'hackathon',
              source: 'devpost_csv',
            },
          },
          { upsert: true, new: true }
        );

        const project = await ProjectRecord.findOneAndUpdate(
          {
            builderId: builder._id,
            sourceId: normalized.submissionUrl || normalized.projectTitle,
          },
          {
            $set: {
              builderId: builder._id,
              eventId: event._id,
              projectName: normalized.projectTitle,
              links: {
                devpost: normalized.submissionUrl,
                videoDemo: normalized.videoDemoLink,
                screenshots: normalized.imageGalleryUrls,
              },
              techStack: normalized.techStack,
              source: 'devpost_csv',
              sourceId: normalized.submissionUrl || normalized.projectTitle,
              verificationStatus: 'imported_unverified',
              confidence: normalized.confidence,
            },
          },
          { upsert: true, new: true }
        );

        await ContributionRecord.findOneAndUpdate(
          { builderId: builder._id, projectId: project._id },
          {
            $set: {
              builderId: builder._id,
              projectId: project._id,
              role: 'builder',
              specificContribution: normalized.contribution,
              contributionAreas: normalized.contribution
                ? normalized.contribution
                    .split(/[,.]/)
                    .map((part) => part.trim())
                    .filter(Boolean)
                : [],
              skillsUsed: normalized.techStack,
              verificationStatus: 'imported_unverified',
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        totalRows: rows.length,
        acceptedCount: accepted.length,
        excludedCount: excluded.length,
        accepted,
        excluded,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Import failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
