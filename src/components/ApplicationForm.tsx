import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { WrappedText } from "./text/WrappedText";

// Normalize URLs to include protocol if missing
const normalizeUrl = (value: unknown): string => {
  const input = typeof value === "string" ? value.trim() : "";
  if (input.length === 0) return "";
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);
  return hasScheme ? input : `https://${input}`;
};

const formSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  age: z
    .number({ invalid_type_error: "Age must be a number" })
    .int("Age must be an integer")
    .min(10, "Please enter a valid age")
    .max(120, "Please enter a valid age"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  major: z.string().min(2, "Please enter your major"),
  yearOfStudy: z.enum(
    ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"],
    {
      required_error: "Please select your year of study",
    }
  ),
  expectedGradYear: z
    .number({ invalid_type_error: "Graduation year must be a number" })
    .int("Graduation year must be a whole number")
    .min(2024, "Please enter a valid year")
    .max(2100, "Please enter a valid year"),
  linkedin: z
    .string()
    .transform((v) => normalizeUrl(v))
    .pipe(z.string().url("Please enter a valid LinkedIn URL")),
  github: z
    .string()
    .transform((v) => normalizeUrl(v))
    .pipe(z.union([z.string().url(), z.literal("")]))
    .optional(),
  website: z
    .string()
    .transform((v) => normalizeUrl(v))
    .pipe(z.union([z.string().url(), z.literal("")]))
    .optional(),
  workEligibility: z.enum(["Yes", "No"], {
    required_error: "Please select your work eligibility",
  }),
  needSponsorship: z.enum(["Yes", "No"], {
    required_error: "Please select your sponsorship requirement",
  }),
  sponsorshipType: z.string().optional(),
  resumeUrl: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// No country selection in the new form schema

interface ApplicationFormProps {
  prefill?: Partial<FormData>;
  variant?: "single" | "multi";
  onFormChange?: (hasChanges: boolean) => void;
}

const ApplicationForm: React.FC<ApplicationFormProps> = ({
  prefill,
  variant = "multi",
  onFormChange,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(
    null as "saved" | "saving" | "error" | null
  );
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [previousFormData, setPreviousFormData] = useState(
    null as FormData | null
  );
  const [submitError, setSubmitError] = useState(null as string | null);
  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "warning" | "success";
  } | null>(null);
  const totalSteps = variant === "single" ? 1 : 4;

  // Toast notification function
  const showToast = (
    message: string,
    type: "error" | "warning" | "success"
  ) => {
    setToast({ message, type });
    // Auto-hide toast after 5 seconds
    setTimeout(() => setToast(null), 5000);
  };

  type FormField = keyof FormData;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty, isValid },
    trigger,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      age: undefined as unknown as number,
      email: "",
      phone: "",
      major: "",
      yearOfStudy: "" as any,
      expectedGradYear: undefined as unknown as number,
      linkedin: "",
      github: "",
      website: "",
      workEligibility: "" as any,
      needSponsorship: "" as any,
      sponsorshipType: "",
      resumeUrl: "",
    },
  });

  const formData = watch();

  const required: (keyof FormData)[] = [
    "name",
    "age",
    "email",
    "phone",
    "major",
    "yearOfStudy",
    "expectedGradYear",
    "linkedin",
    "workEligibility",
    "needSponsorship",
  ];
  const completedRequiredCount = required.reduce((acc, key) => {
    const val = formData[key];
    if (val === undefined || val === null) return acc;
    if (typeof val === "number") return acc + (Number.isFinite(val) ? 1 : 0);
    if (typeof val === "string") return acc + (val.trim().length > 0 ? 1 : 0);
    return acc;
  }, 0);
  const totalRequiredCount = required.length;

  // Prefill fields from props if provided
  useEffect(() => {
    if (!prefill) return;
    Object.entries(prefill).forEach(([key, value]) => {
      if (value == null) return;
      if (key in formSchema.shape) {
        setValue(key as keyof FormData, value as any, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      }
    });
  }, [prefill, setValue]);

  // Check if form data has actually changed
  useEffect(() => {
    if (previousFormData === null) {
      setPreviousFormData(formData);
      return;
    }

    const hasChanged = Object.keys(formData).some((key) => {
      const typedKey = key as keyof FormData;
      return formData[typedKey] !== previousFormData[typedKey];
    });

    if (hasChanged) {
      setPreviousFormData(formData);
      // Notify parent component about form changes
      onFormChange?.(true);
    }
  }, [formData, previousFormData, onFormChange]);

  // Load saved data (Note: localStorage not available in Claude artifacts)
  useEffect(() => {
    const loadSavedData = async () => {
      // Load saved data from API for authenticated user
      try {
        const response = await fetch(`/api/application`);
        const result = await response.json();

        if (result.success && result.data) {
          const data = result.data;
          // Only set form fields that exist in the schema, exclude 'user', '_id', etc.
          Object.entries(data).forEach(([key, value]) => {
            // Skip non-form fields like _id, user, __v, createdAt
            if (key.startsWith("_") || key === "user" || key === "createdAt") {
              return;
            }
            if (key in formSchema.shape && value != null) {
              setValue(key as keyof FormData, value as any, {
                shouldDirty: false,
                shouldTouch: false,
                shouldValidate: false,
              });
            }
          });
          setCurrentStep(data.progress || 1);
        }
      } catch (error) {
        console.error("Error loading saved data:", error);
      }
    };

    loadSavedData();
  }, [setValue]);

  // Save progress when completing a step
  const saveProgress = async () => {
    if (formData.email) {
      setSaveStatus("saving");
      try {
        const response = await fetch("/api/application", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, progress: currentStep }),
        });

        if (response.ok) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus(null), 2000);
          // localStorage.setItem("applicationEmail", formData.email);
        } else {
          setSaveStatus("error");
        }
      } catch (error) {
        setSaveStatus("error");
      }
    }
  };

  // Auto-save functionality when fields change
  useEffect(() => {
    if (!formData.email) return;

    const saveTimeout = setTimeout(async () => {
      // Check if fields for the current step are complete
      const isStepComplete = (() => {
        switch (currentStep) {
          case 1:
            return (
              !!formData.name &&
              Number.isFinite(formData.age as unknown as number) &&
              !!formData.email &&
              !!formData.phone
            );
          case 2:
            return !!formData.major && !!formData.yearOfStudy;
          case 3:
            return Number.isFinite(
              formData.expectedGradYear as unknown as number
            );
          case 4:
            return (
              !!formData.linkedin &&
              !!formData.workEligibility &&
              !!formData.needSponsorship
            );
          default:
            return false;
        }
      })();

      const hasChanged =
        previousFormData !== null &&
        Object.keys(formData).some((key) => {
          const typedKey = key as keyof FormData;
          return formData[typedKey] !== previousFormData[typedKey];
        });

      if (hasChanged && isStepComplete) {
        await saveProgress();
      }
    }, 1000);

    return () => clearTimeout(saveTimeout);
  }, [formData, currentStep, previousFormData]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Validate all fields before submission
      const isValid = await trigger();

      console.log("Form Data: ", JSON.stringify(data));
      console.log("Is Valid: ", isValid);

      if (!isValid) {
        // Only show missing fields that are actually in the schema
        const missingFields = required.filter((key) => {
          const val = formData[key];
          // Handle numeric fields (age, expectedGradYear)
          if (key === "age" || key === "expectedGradYear") {
            return (
              val === undefined ||
              val === null ||
              !Number.isFinite(val as number)
            );
          }
          // Handle string fields
          return (
            val === undefined || val === null || String(val).trim().length === 0
          );
        });
        if (missingFields.length > 0) {
          // Convert field names to user-friendly labels
          const fieldLabels: Record<string, string> = {
            name: "Full Name",
            age: "Age",
            email: "Email",
            phone: "Phone Number",
            major: "Major",
            yearOfStudy: "Year of Study",
            expectedGradYear: "Expected Graduation Year",
            linkedin: "LinkedIn Profile",
            github: "GitHub Profile",
            website: "Personal Website",
            workEligibility: "U.S. Work Eligibility",
            needSponsorship: "Visa Sponsorship Requirement",
            sponsorshipType: "Sponsorship Type",
          };

          const missingLabels = missingFields.map(
            (field) => fieldLabels[field] || field
          );
          const message = `Please fill in the following required fields: ${missingLabels.join(
            ", "
          )}`;
          showToast(message, "warning");
          throw new Error(message);
        } else {
          const message = "Please fill out all required fields correctly";
          showToast(message, "warning");
          throw new Error(message);
        }
      }

      const response = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          progress: variant === "single" ? 4 : totalSteps,
        }),
      });

      const result = await response.json();

      console.log("Submission Result: ", result);

      if (response.ok) {
        showToast("Application submitted successfully! 🎉", "success");

        setIsSubmitted(true);
      } else {
        throw new Error(result.error || "Failed to submit application");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Error submitting application. Please try again.";
      setSubmitError(errorMessage);
      console.error("Submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="bg-black/20 backdrop-blur-sm p-8 rounded-2xl border border-gray-700/50 text-center relative overflow-hidden">
          <div className="mb-6 relative z-10">
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-gray-800/50 border border-gray-600">
              <svg
                className="h-8 w-8 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4 relative z-10">
            Application Submitted Successfully!
          </h2>
          <p className="text-gray-300 mb-6 relative z-10">
            Thank you for applying to{" "}
            <span className="text-gray-200 font-semibold">DevLabs</span>. We
            will review your application and get back to you soon.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-orange-500/80 hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-black transition-colors duration-200 relative z-10"
          >
            Edit Application
          </button>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6 border-2 border-dashed border-gray-500/50 p-6 rounded-lg">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Full Name
                </label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Age
                </label>
                <Controller
                  name="age"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="number"
                      min={10}
                      max={120}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  )}
                />
                {errors.age && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.age.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Email (ASU Email Preferred)
                </label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      placeholder="example@asu.edu"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                <p className="mt-1 text-xs text-gray-500">.asu.edu</p>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Phone No.
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
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 border-2 border-dashed border-gray-500/50 p-6 rounded-lg">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Major
                </label>
                <Controller
                  name="major"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      placeholder="Computer Science"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                {errors.major && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.major.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Year of Study
                </label>
                <Controller
                  name="yearOfStudy"
                  control={control}
                  defaultValue={"" as any}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    >
                      <option value="">Select year</option>
                      <option value="Freshman">Freshman</option>
                      <option value="Sophomore">Sophomore</option>
                      <option value="Junior">Junior</option>
                      <option value="Senior">Senior</option>
                      <option value="Masters">Masters</option>
                      <option value="PhD">PhD</option>
                    </select>
                  )}
                />
                {errors.yearOfStudy && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.yearOfStudy.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 border-2 border-dashed border-gray-500/50 p-6 rounded-lg">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Expected Graduation Year
                </label>
                <Controller
                  name="expectedGradYear"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="number"
                      min={2024}
                      max={2100}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="2025"
                    />
                  )}
                />
                {errors.expectedGradYear && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.expectedGradYear.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6 border-2 border-dashed border-gray-500/50 p-6 rounded-lg">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  LinkedIn Profile
                </label>
                <Controller
                  name="linkedin"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="url"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      placeholder="https://linkedin.com/in/yourname"
                      onBlur={(e) => {
                        const normalized = normalizeUrl(e.target.value);
                        field.onChange(normalized);
                        field.onBlur();
                      }}
                    />
                  )}
                />
                {errors.linkedin && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.linkedin.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  GitHub Profile (optional)
                </label>
                <Controller
                  name="github"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="url"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      placeholder="https://github.com/yourusername"
                      onBlur={(e) => {
                        const normalized = normalizeUrl(e.target.value);
                        field.onChange(normalized);
                        field.onBlur();
                      }}
                    />
                  )}
                />
                {errors.github && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.github.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Personal Website (optional)
                </label>
                <Controller
                  name="website"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="url"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                      placeholder="https://yourwebsite.com"
                      onBlur={(e) => {
                        const normalized = normalizeUrl(e.target.value);
                        field.onChange(normalized);
                        field.onBlur();
                      }}
                    />
                  )}
                />
                {errors.website && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.website.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Are you eligible to work in the U.S.?
                </label>
                <Controller
                  name="workEligibility"
                  control={control}
                  defaultValue={"" as any}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    >
                      <option value="">Select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  )}
                />
                {errors.workEligibility && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.workEligibility.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Would you require visa sponsorship now or in the future?
                </label>
                <Controller
                  name="needSponsorship"
                  control={control}
                  defaultValue={"F" as any}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    >
                      <option value="">Select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  )}
                />
                {errors.needSponsorship && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.needSponsorship.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                If yes, what type of sponsorship would you require? (optional)
              </label>
              <Controller
                name="sponsorshipType"
                defaultValue={"FR" as any}
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="e.g., H-1B, OPT, CPT, Green Card, N/A"
                  />
                )}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // For single-page variant, render all steps in one view
  const renderAll = () => {
    return (
      <div className="space-y-10">
        {/* Personal Information */}
        <div className="space-y-6 rounded-xl border border-white/10 bg-neutral-900/60 p-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Personal information
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Tell us a bit about you. All fields are required.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  />
                )}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Age
              </label>
              <Controller
                name="age"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min={10}
                    max={120}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
              {errors.age && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.age.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email (ASU Email Preferred)
              </label>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="email"
                    placeholder="example@asu.edu"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  />
                )}
              />
              <p className="mt-1 text-xs text-gray-500">.asu.edu</p>
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone No.
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
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Major
              </label>
              <Controller
                name="major"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    placeholder="Computer Science"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  />
                )}
              />
              {errors.major && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.major.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Academic Information */}
        <div className="space-y-6 rounded-xl border border-white/10 bg-neutral-900/60 p-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Academic Information
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Tell us about your academic journey.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Year of Study
              </label>
              <Controller
                name="yearOfStudy"
                control={control}
                defaultValue={"" as any}
                render={({ field }) => (
                  <select
                    {...field}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  >
                    <option value="">Select year</option>
                    <option value="Freshman">Freshman</option>
                    <option value="Sophomore">Sophomore</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                    <option value="Masters">Masters</option>
                    <option value="PhD">PhD</option>
                  </select>
                )}
              />
              {errors.yearOfStudy && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.yearOfStudy.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Expected Graduation Year
              </label>
              <Controller
                name="expectedGradYear"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="number"
                    min={2024}
                    max={2100}
                    placeholder="2025"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
              {errors.expectedGradYear && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.expectedGradYear.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Final Section */}
        <div className="space-y-6 rounded-xl border border-white/10 bg-neutral-900/60 p-5">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                LinkedIn Profile
              </label>
              <Controller
                name="linkedin"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="url"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="https://linkedin.com/in/yourname"
                    onBlur={(e) => field.onChange(normalizeUrl(e.target.value))}
                  />
                )}
              />
              {errors.linkedin && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.linkedin.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                GitHub / Portfolio / Website (optional)
              </label>
              <Controller
                name="website"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="url"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="https://github.com/you or https://your-portfolio.com"
                    onBlur={(e) => field.onChange(normalizeUrl(e.target.value))}
                  />
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Are you eligible to work in the U.S.?
              </label>
              <Controller
                name="workEligibility"
                control={control}
                defaultValue={"" as any}
                render={({ field }) => (
                  <select
                    {...field}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  >
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                )}
              />
              {errors.workEligibility && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.workEligibility.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Would you require visa sponsorship now or in the future?
              </label>
              <Controller
                name="needSponsorship"
                control={control}
                defaultValue={"" as any}
                render={({ field }) => (
                  <select
                    {...field}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  >
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                )}
              />
              {errors.needSponsorship && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.needSponsorship.message}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              If yes, what type of sponsorship would you require? (e.g., H-1B,
              OPT, CPT, Green Card, Other - please specify) or mention N/A
            </label>
            <Controller
              name="sponsorshipType"
              control={control}
              render={({ field }) => (
                <input
                  {...field}
                  type="text"
                  className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  placeholder="e.g., H-1B, OPT, CPT, Green Card, N/A"
                />
              )}
            />
            {errors.sponsorshipType && (
              <p className="mt-1 text-sm text-red-400">
                {errors.sponsorshipType.message}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Add a function to get the step title
  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return "Personal Information";
      case 2:
        return "About You";
      case 3:
        return "Additional Information";
      case 4:
        return "Final Thoughts";
      default:
        return "";
    }
  };

  const multiStepUi = (
    <div className="relative">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ${
            toast.type === "error"
              ? "bg-red-500/20 border-red-500/30 text-red-300"
              : toast.type === "warning"
              ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-300"
              : "bg-green-500/20 border-green-500/30 text-green-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {toast.type === "error" && <span className="text-lg">❌</span>}
              {toast.type === "warning" && <span className="text-lg">⚠️</span>}
              {toast.type === "success" && <span className="text-lg">✅</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="flex-shrink-0 text-lg hover:opacity-70 transition-opacity"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="w-full p-0">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-4">
              {getStepTitle()}
            </h1>
            <div className="relative pt-1">
              <div className="overflow-hidden h-1 mb-4 text-xs flex rounded bg-gray-800/50">
                <div
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-orange-500/60 transition-all duration-500"
                />
              </div>
              <div className="flex mb-2 items-center justify-end">
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-gray-400">
                    {currentStep}/{totalSteps}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {currentStep === totalSteps && Object.keys(errors).length > 0 && (
            <div className="mb-6 p-4 bg-neutral-900/50 border border-gray-700 rounded-md">
              <h3 className="text-sm font-bold text-gray-300 mb-2">
                Validation Status:
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                {Object.entries(errors).map(([field, error]) => (
                  <li key={field} className="text-sm text-red-300">
                    {field}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {submitError && (
            <div className="mb-6 p-4 bg-neutral-900/50 border border-gray-700 rounded-md">
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div key={`step-${currentStep}`}>{renderStep()}</div>

            <div className="flex justify-between pt-6">
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className={`px-4 py-2 border border-gray-700 rounded-md text-sm font-medium text-gray-300 hover:bg-neutral-900 hover:text-white transition-all ${
                  currentStep === 1 ? "invisible" : ""
                }`}
              >
                Previous
              </button>

              {currentStep < totalSteps ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const fieldsToValidate: FormField[] = (() => {
                        switch (currentStep) {
                          case 1:
                            return ["name", "age", "email", "phone"];
                          case 2:
                            return ["major", "yearOfStudy"];
                          case 3:
                            return ["expectedGradYear"];
                          case 4:
                            return [
                              "linkedin",
                              "workEligibility",
                              "needSponsorship",
                            ];
                          default:
                            return [];
                        }
                      })();

                      const isValid = await trigger(fieldsToValidate);
                      if (isValid) {
                        setCurrentStep((prev) =>
                          Math.min(totalSteps, prev + 1)
                        );
                        saveProgress().catch(console.error);
                      }
                    } catch (error) {
                      console.error("Error moving to next step:", error);
                    }
                  }}
                  className="px-4 py-2 rounded-md text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition"
                >
                  Next
                </button>
              ) : (
                <WrappedText
                  size="large"
                  className="border-orange-300 text-orange-300 bg-transparent"
                >
                  <button
                    type="submit"
                    disabled={isSubmitting || !isValid}
                    className="w-full bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 px-4 py-2 flex items-center justify-center text-center"
                  >
                    {isSubmitting ? "Submitting..." : "Update Profile"}
                  </button>
                </WrappedText>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  const singlePageUi = (
    <div className="relative">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ${
            toast.type === "error"
              ? "bg-red-500/20 border-red-500/30 text-red-300"
              : toast.type === "warning"
              ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-300"
              : "bg-green-500/20 border-green-500/30 text-green-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {toast.type === "error" && <span className="text-lg">❌</span>}
              {toast.type === "warning" && <span className="text-lg">⚠️</span>}
              {toast.type === "success" && <span className="text-lg">✅</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="flex-shrink-0 text-lg hover:opacity-70 transition-opacity"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sticky progress bar */}
      <div className="sticky top-16 z-20 bg-transparent/0 backdrop-blur-0">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="h-1 bg-gray-800/50 rounded">
            <div
              className="h-1 bg-orange-500/70 rounded transition-all duration-300"
              style={{
                width: `${Math.round(
                  (completedRequiredCount / totalRequiredCount) * 100
                )}%`,
              }}
            />
          </div>
          <div className="mt-1 text-right text-xs text-gray-400">
            {completedRequiredCount}/{totalRequiredCount} required fields
            complete
          </div>
        </div>
      </div>
      <div className="relative z-10 max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {submitError && (
          <div className="mb-6 p-4 bg-neutral-900/50 border border-gray-700 rounded-md">
            <p className="text-sm text-red-300">{submitError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
          {renderAll()}
          <div className="pt-2">
            <WrappedText
              size="large"
              className="border-orange-300 text-orange-300 bg-transparent block"
            >
              <button
                type="submit"
                disabled={isSubmitting || !isValid}
                className="w-full bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 px-6 py-3 flex items-center justify-center text-center"
              >
                {isSubmitting ? "Submitting..." : "Update Profile"}
              </button>
            </WrappedText>
          </div>
        </form>
      </div>
    </div>
  );

  return variant === "single" ? singlePageUi : multiStepUi;
};

export default ApplicationForm;
