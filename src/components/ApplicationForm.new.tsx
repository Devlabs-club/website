import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { WrappedText } from "./text/WrappedText";
import { ApplicationInputSchema, type ApplicationInput } from "../models/application";

/**
 * Simplified Application Form - New Schema
 * 
 * Only captures fields in the new Application model:
 * - major (required)
 * - track, teamName, teamPreference
 * - tShirtSize, dietaryRestrictions
 * - whyJoin
 * 
 * User identity (name, email) comes from authentication context
 */

// Use the shared schema. We may extend client-side messages or placeholders as needed.
const formSchema = ApplicationInputSchema;

type FormData = z.infer<typeof formSchema>;

interface ApplicationFormProps {
  prefill?: Partial<FormData>;
  onFormChange?: (hasChanges: boolean) => void;
}

const ApplicationForm: React.FC<ApplicationFormProps> = ({
  prefill,
  onFormChange,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "warning" | "success";
  } | null>(null);

  const showToast = (
    message: string,
    type: "error" | "warning" | "success"
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      // Required
      name: prefill?.name || "",
      gender: prefill?.gender || ("male" as any),
      dob: (prefill?.dob as any) || ("" as any),
      email: prefill?.email || "",
      phone: prefill?.phone || "",
      country: prefill?.country || "",
      major: prefill?.major || "",
      linkedin: prefill?.linkedin || "",
      github: prefill?.github || "",
      coolestThing: prefill?.coolestThing || "",
      hackathonStory: prefill?.hackathonStory || "",
      resumeUrl: prefill?.resumeUrl || "",

      // Optional
      personalWebsite: prefill?.personalWebsite || "",
      portfolio: prefill?.portfolio || "",
      favoriteLink: prefill?.favoriteLink || "",
      twitterHandle: prefill?.twitterHandle || "",
      additionalInfo: prefill?.additionalInfo || "",
      projectIdea: prefill?.projectIdea || "",
      referralSource: prefill?.referralSource || "",
      proofOfWork: prefill?.proofOfWork || "",
    } as any,
  });

  const formData = watch();

  // Notify parent of changes
  useEffect(() => {
    onFormChange?.(isDirty);
  }, [isDirty, onFormChange]);

  // Fetch existing application on mount and fetch resumeUrl from /api/auth/me
  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const response = await fetch("/api/application");
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // Application exists, mark as submitted
            setIsSubmitted(true);
            const data = result.data as Partial<FormData>;
            // Prefill fields from existing app
            Object.entries(data).forEach(([key, value]) => {
              if (key in (formSchema.shape as any) && value != null) {
                setValue(key as any, value as any, { shouldDirty: false });
              }
            });
          }
        }
      } catch (error) {
        console.error("Error fetching application:", error);
      }
    };
    const fetchResume = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        const json = await res.json();
        if (json?.success && json?.user?.resumeUrl) {
          setValue("resumeUrl" as any, json.user.resumeUrl, { shouldDirty: false });
        }
      } catch (e) {
        console.warn("Unable to prefill resumeUrl", e);
      }
    };
    fetchApplication();
    fetchResume();
  }, []);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Ensure resumeUrl present
      if (!data.resumeUrl) {
        throw new Error("Please upload your resume before submitting the application.");
      }
      const response = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        showToast("Application submitted successfully! 🎉", "success");
        setIsSubmitted(true);
      } else {
        throw new Error(result.error || "Failed to submit application");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Error submitting application. Please try again.";
      setSubmitError(message);
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSubmitted && !isDirty) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Application Submitted Successfully!
          </h2>
          <p className="text-gray-300 mb-6">
            We've received your application and will review it soon.
          </p>
          <button
            onClick={() => setIsSubmitted(false)}
            className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors"
          >
            Edit Application
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
            toast.type === "success"
              ? "bg-green-500"
              : toast.type === "error"
              ? "bg-red-500"
              : "bg-yellow-500"
          } text-white`}
        >
          {toast.message}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="mb-8">
          <WrappedText size="large" className="border-orange-300 text-orange-300 mb-2">
            Application Form
          </WrappedText>
          <p className="text-gray-400">
            Complete your application to join DevLabs
          </p>
        </div>

        {/* Academic Information */}
        {/* Personal & Contact */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Personal Information</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Controller name="name" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Full Name <span className="text-red-500">*</span></label>
                <input {...field} type="text" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name.message}</p>}
              </div>
            )} />
            <Controller name="gender" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Gender <span className="text-red-500">*</span></label>
                <select {...field} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                </select>
                {errors.gender && <p className="text-red-400 text-sm mt-1">{(errors.gender as any).message}</p>}
              </div>
            )} />
            <Controller name="dob" control={control} render={({ field }) => {
              const f: any = field;
              const value = typeof f.value === 'string' ? f.value : (f.value ? new Date(f.value).toISOString().slice(0,10) : '');
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Date of Birth <span className="text-red-500">*</span></label>
                  <input name={f.name} ref={f.ref} value={value} onChange={f.onChange} onBlur={f.onBlur} type="date" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                  {errors.dob && <p className="text-red-400 text-sm mt-1">{(errors.dob as any).message}</p>}
                </div>
              );
            }} />
            <Controller name="email" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Email <span className="text-red-500">*</span></label>
                <input {...field} type="email" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
              </div>
            )} />
            <Controller name="phone" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone <span className="text-red-500">*</span></label>
                <input {...field} type="tel" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.phone && <p className="text-red-400 text-sm mt-1">{errors.phone.message}</p>}
              </div>
            )} />
            <Controller name="country" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Country <span className="text-red-500">*</span></label>
                <input {...field} type="text" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.country && <p className="text-red-400 text-sm mt-1">{errors.country.message}</p>}
              </div>
            )} />
          </div>
        </div>

        {/* Academic */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Academic Information</h3>
          <Controller name="major" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Major <span className="text-red-500">*</span></label>
              <input {...field} type="text" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" placeholder="e.g., Computer Science" />
              {errors.major && <p className="text-red-400 text-sm mt-1">{errors.major.message}</p>}
            </div>
          )} />
        </div>

        {/* Links */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Links</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Controller name="linkedin" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">LinkedIn <span className="text-red-500">*</span></label>
                <input {...field} type="url" placeholder="https://www.linkedin.com/in/username" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.linkedin && <p className="text-red-400 text-sm mt-1">{errors.linkedin.message}</p>}
              </div>
            )} />
            <Controller name="github" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">GitHub <span className="text-red-500">*</span></label>
                <input {...field} type="url" placeholder="https://github.com/username" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.github && <p className="text-red-400 text-sm mt-1">{errors.github.message}</p>}
              </div>
            )} />
            <Controller name="personalWebsite" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Personal Website</label>
                <input {...field} type="url" placeholder="https://example.com" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.personalWebsite && <p className="text-red-400 text-sm mt-1">{errors.personalWebsite.message}</p>}
              </div>
            )} />
            <Controller name="portfolio" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Portfolio</label>
                <input {...field} type="url" placeholder="https://portfolio.example.com" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.portfolio && <p className="text-red-400 text-sm mt-1">{errors.portfolio.message}</p>}
              </div>
            )} />
            <Controller name="favoriteLink" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Favorite Link</label>
                <input {...field} type="url" placeholder="https://..." className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.favoriteLink && <p className="text-red-400 text-sm mt-1">{errors.favoriteLink.message}</p>}
              </div>
            )} />
            <Controller name="twitterHandle" control={control} render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Twitter Handle</label>
                <input {...field} type="text" placeholder="@username or https://x.com/username" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
                {errors.twitterHandle && <p className="text-red-400 text-sm mt-1">{(errors.twitterHandle as any).message}</p>}
              </div>
            )} />
          </div>
        </div>

        {/* Story */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Your Story</h3>
          <Controller name="coolestThing" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Coolest Thing You've Built <span className="text-red-500">*</span></label>
              <textarea {...field} rows={4} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500 resize-none" />
              {errors.coolestThing && <p className="text-red-400 text-sm mt-1">{errors.coolestThing.message}</p>}
            </div>
          )} />
          <Controller name="hackathonStory" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Hackathon Story <span className="text-red-500">*</span></label>
              <textarea {...field} rows={4} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500 resize-none" />
              {errors.hackathonStory && <p className="text-red-400 text-sm mt-1">{errors.hackathonStory.message}</p>}
            </div>
          )} />
          <Controller name="projectIdea" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Project Idea (Optional)</label>
              <textarea {...field} rows={3} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500 resize-none" />
              {errors.projectIdea && <p className="text-red-400 text-sm mt-1">{errors.projectIdea.message}</p>}
            </div>
          )} />
          <Controller name="additionalInfo" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Additional Info (Optional)</label>
              <textarea {...field} rows={3} className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500 resize-none" />
              {errors.additionalInfo && <p className="text-red-400 text-sm mt-1">{errors.additionalInfo.message}</p>}
            </div>
          )} />
          <Controller name="proofOfWork" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Proof of Work (Optional)</label>
              <input {...field} type="text" placeholder="Links separated by space" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
              {errors.proofOfWork && <p className="text-red-400 text-sm mt-1">{errors.proofOfWork.message}</p>}
            </div>
          )} />
          <Controller name="referralSource" control={control} render={({ field }) => (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">How did you hear about us? (Optional)</label>
              <input {...field} type="text" className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500" />
              {errors.referralSource && <p className="text-red-400 text-sm mt-1">{errors.referralSource.message}</p>}
            </div>
          )} />
        </div>

        {/* Hidden resumeUrl field just to satisfy Zod resolver in UI; it's still validated */}
        <input type="hidden" value={watch("resumeUrl") as any} readOnly />

        {/* Deprecated team/event/whyJoin fields removed */}

        {/* Submit Error */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-red-400 text-sm">{submitError}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ApplicationForm;
