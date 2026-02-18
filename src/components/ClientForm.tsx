import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import type { SubmitErrorHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { WrappedText } from "./text/WrappedText";

const normalizeUrl = (value: unknown): string => {
  const input = typeof value === "string" ? value.trim() : "";
  if (input.length === 0) return "";
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);
  return hasScheme ? input : `https://${input}`;
};

const ROLE_TYPES = [
  "Internship (Paid)",
  "Internship (Unpaid)",
  "Part-time Role",
  "Full-time Role",
  "Contract/Freelance",
] as const;

const WORK_MODES = ["Remote", "Hybrid", "On-Site"] as const;

type RoleType = (typeof ROLE_TYPES)[number];
type WorkMode = (typeof WORK_MODES)[number];

const formSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  companyWebsite: z
    .string()
    .transform((v) => normalizeUrl(v))
    .pipe(z.string().url("Enter a valid company website")),
  contactName: z.string().min(2, "Contact name is required"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email"),
  roleTitle: z.string().min(2, "Role title is required"),
  roleType: z.array(z.enum(ROLE_TYPES)).min(1, "Select at least one role type"),
  workMode: z.array(z.enum(WORK_MODES)).min(1, "Select at least one work mode"),
  roleDescription: z.string().min(10, "Please include role details or link"),
  compensation: z.string().min(1, "Enter compensation or NIL"),
  skills: z.string().min(2, "Please list key skills"),
  mindset: z.string().min(2, "Please list preferred qualities"),
  sponsorVisa: z.enum(["Yes", "No"], {
    required_error: "Please specify if willing to sponsor",
  }),
  additionalNotes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const extractErrorMessage = (errorObject: any): string | null => {
  if (!errorObject) return null;
  if (typeof errorObject === "object") {
    if (
      typeof errorObject.message === "string" &&
      errorObject.message.length > 0
    ) {
      return errorObject.message;
    }
    if (errorObject.root) {
      const rootMessage = extractErrorMessage(errorObject.root);
      if (rootMessage) return rootMessage;
    }
    for (const value of Object.values(errorObject)) {
      const nested = extractErrorMessage(value);
      if (nested) return nested;
    }
  }
  return null;
};

const ClientForm: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      companyName: "",
      companyWebsite: "",
      contactName: "",
      phone: "",
      email: "",
      roleTitle: "",
      roleType: [] as RoleType[],
      workMode: [] as WorkMode[],
      roleDescription: "",
      compensation: "",
      skills: "",
      mindset: "",
      sponsorVisa: undefined,
      additionalNotes: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/clientform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setIsSubmitted(true);
      reset();
    } catch (err) {
      console.error(err);
      setFormError(
        "Something went wrong while submitting the form. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidationError: SubmitErrorHandler<FormData> = (errors) => {
    const message =
      extractErrorMessage(errors) ??
      "Please review the highlighted fields before submitting.";
    setFormError(message);
  };

  if (isSubmitted) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center">
        <div className="bg-black/30 p-8 rounded-2xl border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-2">
            Thank you for sharing your role!
          </h2>
          <p className="text-gray-300">
            Our Devlabs team will reach out soon with qualified matches.
          </p>
          <button
            onClick={() => setIsSubmitted(false)}
            className="mt-6 px-4 py-2 bg-white text-black font-semibold rounded-md hover:bg-gray-200 transition"
          >
            Submit Another Role
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <form
        onSubmit={handleSubmit(onSubmit, handleValidationError)}
        className="space-y-10"
      >
        {formError && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">
            <p className="font-semibold">We couldn&apos;t submit the form</p>
            <p className="mt-1 text-sm">{formError}</p>
          </div>
        )}
        <div className="space-y-6 rounded-xl  p-5">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Company Name
              </label>
              <Controller
                name="companyName"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                  />
                )}
              />
              {errors.companyName && (
                <p className="text-sm text-red-400">
                  {errors.companyName.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Company Website
              </label>
              <Controller
                name="companyWebsite"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="url"
                    placeholder="https://yourcompany.com"
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                    onBlur={(e) => field.onChange(normalizeUrl(e.target.value))}
                  />
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Primary Contact Name
              </label>
              <Controller
                name="contactName"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                  />
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Phone
              </label>
              <div className="mt-1 flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-700 bg-neutral-800 text-gray-300 text-sm">
                  +1
                </span>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="tel"
                      className="flex-1 block w-full rounded-none rounded-r-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      placeholder="(555) 123-4567"
                    />
                  )}
                />
              </div>
              {errors.phone && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Email Address
              </label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="email"
                    className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                  />
                )}
              />
            </div>
          </div>
        </div>

        <div className="space-y-6 rounded-xl  p-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Role Title
            </label>
            <Controller
              name="roleTitle"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Role Type
              </label>
              <Controller
                name="roleType"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-gray-300">
                    {ROLE_TYPES.map((type) => (
                      <label key={type} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          value={type}
                          checked={field.value.includes(type)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            field.onChange(
                              checked
                                ? [...field.value, type]
                                : field.value.filter((v) => v !== type)
                            );
                          }}
                          className="h-4 w-4 rounded border-gray-600 bg-neutral-800 accent-white"
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
                Location / Work Mode
              </label>
              <Controller
                name="workMode"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-gray-300">
                    {WORK_MODES.map((mode) => (
                      <label key={mode} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          value={mode}
                          checked={field.value.includes(mode)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            field.onChange(
                              checked
                                ? [...field.value, mode]
                                : field.value.filter((v) => v !== mode)
                            );
                          }}
                          className="h-4 w-4 rounded border-gray-600 bg-neutral-800 accent-white"
                        />
                        <span>{mode}</span>
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Role Description
            </label>
            <Controller
              name="roleDescription"
              control={control}
              render={({ field }) => (
                <textarea
                  {...field}
                  rows={4}
                  placeholder="Include key responsibilities or a JD link..."
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Compensation in USD
            </label>
            <Controller
              name="compensation"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  placeholder='e.g., "$25/hr" or "NIL"'
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>
        </div>

        <div className="space-y-6 rounded-xl  p-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Ideal Candidate Skills
            </label>
            <Controller
              name="skills"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  placeholder="e.g., Python, React, UX Design"
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Preferred Candidate Mindset & Qualities
            </label>
            <Controller
              name="mindset"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  placeholder="e.g., Curious, Team-Player, Detail-Oriented"
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Willing to Sponsor Visa Status?
            </label>
            <Controller
              name="sponsorVisa"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                >
                  <option value="">Select</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 text-left">
              Additional Notes (optional)
            </label>
            <Controller
              name="additionalNotes"
              control={control}
              render={({ field }) => (
                <textarea
                  {...field}
                  rows={3}
                  placeholder="Any extra info, special considerations, or context"
                  className="w-full bg-neutral-900 border border-neutral-700 text-white rounded-md px-3 py-2"
                />
              )}
            />
          </div>
        </div>

        <WrappedText
          size="large"
          className="border-white/70 text-white bg-transparent block"
        >
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 px-6 py-3 flex items-center justify-center text-center"
          >
            {isSubmitting ? "Submitting..." : "Submit Role"}
          </button>
        </WrappedText>
      </form>
    </div>
  );
};

export default ClientForm;
