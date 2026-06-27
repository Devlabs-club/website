import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import DynamicEventFormRenderer from './DynamicEventFormRenderer';
import type { EventFormField, EventPublicData, FormResponseValue } from '@/lib/talent/eventTypes';
import { isBuilderProfileCompleteForRegistration } from '@/lib/talent/eventRegistration';
import type { BuilderData } from '@/components/builder/types';

type Props = {
  event: EventPublicData & { formSchema?: { fields?: EventFormField[] } };
  builder?: BuilderData | null;
  existingRegistration?: {
    responses: Record<string, FormResponseValue>;
    status: string;
    submittedAt?: string | null;
  } | null;
  onCompleteProfile?: () => void | Promise<void>;
  onSubmit: (responses: Record<string, FormResponseValue>) => Promise<void>;
};

export default function EventRegistrationFlow({
  event,
  builder,
  existingRegistration,
  onCompleteProfile,
  onSubmit,
}: Props) {
  const fields = event.formSchema?.fields || [];
  const [step, setStep] = useState<'profile' | 'form' | 'done'>(() =>
    existingRegistration ? 'done' : 'form'
  );
  const [values, setValues] = useState<Record<string, FormResponseValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const profileCheck = useMemo(
    () =>
      builder
        ? isBuilderProfileCompleteForRegistration(builder)
        : { complete: false, missing: ['profile'] },
    [builder]
  );

  React.useEffect(() => {
    if (existingRegistration) {
      setStep('done');
      return;
    }
    setStep(profileCheck.complete ? 'form' : 'profile');
  }, [existingRegistration, profileCheck.complete]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setErrors({});
    try {
      await onSubmit(values);
      setStep('done');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      setSubmitError(message);
      if (error && typeof error === 'object' && 'errors' in error) {
        setErrors((error as { errors: Record<string, string> }).errors);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {event.headerImageUrl ? (
        <img
          src={event.headerImageUrl}
          alt={event.name}
          className="w-full h-48 md:h-56 object-cover rounded-2xl border border-white/10"
        />
      ) : null}

      <div>
        <h2 className="text-2xl md:text-3xl font-semibold text-white">{event.name}</h2>
        {event.description ? <p className="text-white/60 mt-2">{event.description}</p> : null}
        <div className="flex flex-wrap gap-3 mt-3 text-sm text-white/50">
          {event.date ? <span>{new Date(event.date).toLocaleDateString()}</span> : null}
          {event.location ? <span>· {event.location}</span> : null}
        </div>
        {event.websiteUrl ? (
          <a
            href={event.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[#fa7d22] hover:text-orange-300 mt-3"
          >
            Visit event website <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : null}
      </div>

      {step === 'profile' ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 space-y-4">
          <h3 className="text-lg font-semibold text-white">Complete your builder profile first</h3>
          <p className="text-sm text-white/70">
            Before registering, add {profileCheck.missing.join(', ')} to your profile.
          </p>
          {onCompleteProfile ? (
            <button
              type="button"
              onClick={() => onCompleteProfile()}
              className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black font-medium"
            >
              Go to profile
            </button>
          ) : null}
        </div>
      ) : null}

      {step === 'form' ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
          <h3 className="text-lg font-semibold text-white">Registration form</h3>
          <DynamicEventFormRenderer
            fields={fields}
            values={values}
            errors={errors}
            onChange={(fieldId, value) => setValues((prev) => ({ ...prev, [fieldId]: value }))}
          />
          {submitError ? <p className="text-sm text-red-400">{submitError}</p> : null}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#fa7d22] text-black font-medium disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit registration
          </button>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h3 className="text-xl font-semibold text-white">You&apos;re registered</h3>
          <p className="text-sm text-white/70 mt-2">
            {existingRegistration?.submittedAt
              ? `Submitted ${new Date(existingRegistration.submittedAt).toLocaleString()}`
              : 'Your registration has been submitted.'}
          </p>
          <div className="mt-6 text-left">
            <DynamicEventFormRenderer
              fields={fields}
              values={existingRegistration?.responses || values}
              readOnly
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
