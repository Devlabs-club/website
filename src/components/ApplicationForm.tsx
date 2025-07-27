import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  gender: z.string().min(1, "Please select your gender"),
  age: z
    .number()
    .min(16, "You must be at least 16 years old")
    .max(100, "Please enter a valid age"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  about: z
    .string()
    .min(50, "Please tell us more about yourself (minimum 50 characters)"),
  country: z.string().min(1, "Please select your country"),
  projectIdea: z
    .string()
    .min(50, "Please describe your project idea (minimum 50 characters)"),
  referralSource: z.string().min(1, "Please tell us how you found us"),
  twitterHandle: z.string().optional(),
  additionalInfo: z.string().optional(),
  proofOfWork: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const ApplicationForm = () => {
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
  const totalSteps = 4;

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
      gender: "",
      age: undefined,
      email: "",
      phone: "",
      about: "",
      country: "",
      projectIdea: "",
      referralSource: "",
      twitterHandle: "",
      additionalInfo: "",
      proofOfWork: "",
    },
  });

  const formData = watch();

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
    }
  }, [formData]);

  // Load saved data
  useEffect(() => {
    const loadSavedData = async () => {
      const email = localStorage.getItem("applicationEmail");
      if (email) {
        try {
          const response = await fetch(`/api/application?email=${email}`);
          const { data } = await response.json();
          if (data) {
            Object.entries(data).forEach(([key, value]) => {
              // Skip non-form fields or null/undefined values
              if (key in formSchema.shape && value != null) {
                setValue(
                  key as keyof FormData,
                  value as string | number | undefined
                );
              }
            });
            setCurrentStep(data.progress || 1);
          }
        } catch (error) {
          console.error("Error loading saved data:", error);
        }
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
          // Store email in localStorage to retrieve later
          localStorage.setItem("applicationEmail", formData.email);
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
              formData.name &&
              formData.gender &&
              formData.age &&
              formData.email &&
              formData.phone &&
              formData.country
            );
          case 2:
            return formData.about && formData.projectIdea;
          case 3:
            return formData.referralSource;
          case 4:
            return true; // No required fields in final step
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
      if (!isValid) {
        throw new Error("Please fill out all required fields correctly");
      }

      const response = await fetch("/api/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, progress: totalSteps }),
      });

      const result = await response.json();

      if (response.ok) {
        localStorage.setItem("applicationEmail", data.email);
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
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8   flex items-center justify-center">
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
            Submit Another Application
          </button>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Name
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
                  Gender
                </label>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">
                        Prefer not to say
                      </option>
                    </select>
                  )}
                />
                {errors.gender && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.gender.message}
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
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
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
                  Email
                </label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Phone
                </label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="tel"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                {errors.phone && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Country
                </label>
                <Controller
                  name="country"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    />
                  )}
                />
                {errors.country && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.country.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Tell us about yourself
              </label>
              <Controller
                name="about"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="Share your background, interests, and what drives you..."
                  />
                )}
              />
              {errors.about && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.about.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                What do you want to build?
              </label>
              <Controller
                name="projectIdea"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="Describe your project idea in detail..."
                  />
                )}
              />
              {errors.projectIdea && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.projectIdea.message}
                </p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                How did you find out about us?
              </label>
              <Controller
                name="referralSource"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                  >
                    <option value="">Select an option</option>
                    <option value="social-media">Social Media</option>
                    <option value="friend">Friend</option>
                    <option value="search">Search Engine</option>
                    <option value="other">Other</option>
                  </select>
                )}
              />
              {errors.referralSource && (
                <p className="mt-1 text-sm text-red-400">
                  {errors.referralSource.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Twitter Handle (optional)
              </label>
              <Controller
                name="twitterHandle"
                control={control}
                render={({ field }) => (
                  <input
                    {...field}
                    type="text"
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="@username"
                  />
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Proof of Work (optional)
              </label>
              <Controller
                name="proofOfWork"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="Share links to your previous work, GitHub repositories, or portfolio..."
                  />
                )}
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Anything else you'd like to tell us?
              </label>
              <Controller
                name="additionalInfo"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={4}
                    className="mt-1 block w-full rounded-md bg-neutral-900 border-neutral-700 text-white shadow-sm focus:border-white focus:ring-white"
                    placeholder="Share any additional information that might be relevant..."
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

  return (
    <div className="relative overflow-hidden">
      <div className="relative z-10 max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex items-center ">
        <div
          className="w-full bg-black/20 backdrop-blur-sm rounded-2xl p-8 border border-gray-700/50 transition-all duration-500 ease-in-out"
          style={{}}
        >
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
            <div className="mb-6 p-4 bg-black/30 backdrop-blur-sm border border-gray-600 rounded-md">
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
            <div className="mb-6 p-4 bg-black/30 backdrop-blur-sm border border-gray-600 rounded-md">
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {renderStep()}

            <div className="flex justify-between pt-6">
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className={`px-4 py-2 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-black/20 hover:bg-gray-800/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-black transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95 ${
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
                      // Validate current step before proceeding
                      const fieldsToValidate: FormField[] = (() => {
                        switch (currentStep) {
                          case 1:
                            return [
                              "name",
                              "gender",
                              "age",
                              "email",
                              "phone",
                              "country",
                            ];
                          case 2:
                            return ["about", "projectIdea"];
                          case 3:
                            return ["referralSource"];
                          default:
                            return [];
                        }
                      })();

                      const isValid = await trigger(fieldsToValidate);
                      if (isValid) {
                        // Move to next step immediately for smooth UX
                        setCurrentStep((prev) =>
                          Math.min(totalSteps, prev + 1)
                        );
                        // Save progress in background (non-blocking)
                        saveProgress().catch(console.error);
                      }
                    } catch (error) {
                      console.error("Error moving to next step:", error);
                    }
                  }}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-orange-500/80 hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-black transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || !isValid}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-orange-500/80 hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-95"
                >
                  {isSubmitting ? "Submitting..." : "Submit Application"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ApplicationForm;
