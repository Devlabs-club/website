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

// Extended schema for UI-specific validation
const formSchema = ApplicationInputSchema.extend({
  major: z.string().min(2, "Major is required and must be at least 2 characters"),
  whyJoin: z.string().min(20, "Please tell us why you want to join (at least 20 characters)").optional(),
});

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
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      major: prefill?.major || "",
      track: prefill?.track || "",
      teamName: prefill?.teamName || "",
      teamPreference: prefill?.teamPreference || undefined,
      tShirtSize: prefill?.tShirtSize || "",
      dietaryRestrictions: prefill?.dietaryRestrictions || "",
      whyJoin: prefill?.whyJoin || "",
    },
  });

  const formData = watch();

  // Notify parent of changes
  useEffect(() => {
    onFormChange?.(isDirty);
  }, [isDirty, onFormChange]);

  // Fetch existing application on mount
  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const response = await fetch("/api/application");
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // Application exists, mark as submitted
            setIsSubmitted(true);
          }
        }
      } catch (error) {
        console.error("Error fetching application:", error);
      }
    };
    fetchApplication();
  }, []);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
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
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Academic Information</h3>
          
          <Controller
            name="major"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Major <span className="text-red-500">*</span>
                </label>
                <input
                  {...field}
                  type="text"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g., Computer Science"
                />
                {errors.major && (
                  <p className="text-red-400 text-sm mt-1">{errors.major.message}</p>
                )}
              </div>
            )}
          />

          <Controller
            name="track"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Track / Cohort
                </label>
                <input
                  {...field}
                  type="text"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g., Season 1"
                />
                {errors.track && (
                  <p className="text-red-400 text-sm mt-1">{errors.track.message}</p>
                )}
              </div>
            )}
          />
        </div>

        {/* Team Information */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Team Information</h3>
          
          <Controller
            name="teamPreference"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Team Preference
                </label>
                <select
                  {...field}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select...</option>
                  <option value="hasTeam">I have a team</option>
                  <option value="needTeam">I need a team</option>
                  <option value="solo">Working solo</option>
                </select>
                {errors.teamPreference && (
                  <p className="text-red-400 text-sm mt-1">{errors.teamPreference.message}</p>
                )}
              </div>
            )}
          />

          {formData.teamPreference === "hasTeam" && (
            <Controller
              name="teamName"
              control={control}
              render={({ field }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Team ID
                  </label>
                  <input
                    {...field}
                    type="text"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                    placeholder="Enter your team ID (24-character hex)"
                  />
                  {errors.teamName && (
                    <p className="text-red-400 text-sm mt-1">{errors.teamName.message}</p>
                  )}
                </div>
              )}
            />
          )}
        </div>

        {/* Event Logistics */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Event Details</h3>
          
          <Controller
            name="tShirtSize"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  T-Shirt Size
                </label>
                <select
                  {...field}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select...</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
                {errors.tShirtSize && (
                  <p className="text-red-400 text-sm mt-1">{errors.tShirtSize.message}</p>
                )}
              </div>
            )}
          />

          <Controller
            name="dietaryRestrictions"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Dietary Restrictions
                </label>
                <input
                  {...field}
                  type="text"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g., vegetarian, vegan, gluten-free, none"
                />
                {errors.dietaryRestrictions && (
                  <p className="text-red-400 text-sm mt-1">{errors.dietaryRestrictions.message}</p>
                )}
              </div>
            )}
          />
        </div>

        {/* Why Join */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Tell Us More</h3>
          
          <Controller
            name="whyJoin"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Why do you want to join DevLabs?
                </label>
                <textarea
                  {...field}
                  rows={5}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-white focus:outline-none focus:border-orange-500 resize-none"
                  placeholder="Share your motivation, goals, and what you hope to achieve..."
                />
                {errors.whyJoin && (
                  <p className="text-red-400 text-sm mt-1">{errors.whyJoin.message}</p>
                )}
              </div>
            )}
          />
        </div>

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
