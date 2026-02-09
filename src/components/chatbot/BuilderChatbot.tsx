import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import * as z from "zod";

const normalizeUrl = (value: unknown): string => {
  const input = typeof value === "string" ? value.trim() : "";
  if (input.length === 0) return "";
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);
  return hasScheme ? input : `https://${input}`;
};

const chatSchema = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().min(10).max(120),
  email: z.string().email(),
  phone: z.string().regex(/^\+?1?\s?\d{10,15}$/),
  university: z.string().min(2),
  major: z.string().min(2),
  yearOfStudy: z.enum([
    "Freshman",
    "Sophomore",
    "Junior",
    "Senior",
    "Masters",
    "PhD",
  ]),
  expectedGradYear: z.coerce.number().int().min(2024).max(2100),
  linkedin: z
    .string()
    .transform((v) => normalizeUrl(v))
    .pipe(z.string().url()),
  website: z.string().optional(),
  workEligibility: z.enum(["Yes", "No"]),
  needSponsorship: z.enum(["Yes", "No"]),
  sponsorshipType: z.string().optional(),
});

const logo = "/logo.png";

export default function BuilderChatbot() {
  const [messages, setMessages] = useState<
    { sender: "bot" | "user"; text: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  const chatFlow = [
    {
      id: 1,
      text: "Hey Builder, I’m DevBot! Let’s get you started. What’s your full name and age?",
      type: "text",
      fields: ["name", "age"],
    },
    {
      id: 2,
      text: "Thanks! Could you share your email and phone number? (add +1 before your number)",
      type: "text",
      fields: ["email", "phone"],
    },
    {
      id: 3,
      text: "Which university or college are you attending?",
      type: "text",
      fields: ["university"],
    },
    {
      id: 4,
      text: "What’s your major or specialization?",
      type: "text",
      fields: ["major"],
    },
    {
      id: 5,
      text: "Which year are you in?",
      type: "select",
      options: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"],
      fields: ["yearOfStudy"],
    },
    {
      id: 6,
      text: "When do you expect to graduate? (e.g. 2026)",
      type: "number",
      fields: ["expectedGradYear"],
    },
    {
      id: 7,
      text: "Please share your LinkedIn profile URL.",
      type: "url",
      fields: ["linkedin"],
    },
    {
      id: 8,
      text: "Do you have a GitHub or personal website?",
      type: "url",
      fields: ["website"],
    },
    {
      id: 9,
      text: "Are you eligible to work in the United States?",
      type: "boolean",
      options: ["Yes", "No"],
      fields: ["workEligibility"],
    },
    {
      id: 10,
      text: "Would you require sponsorship now or in the future?",
      type: "boolean",
      options: ["Yes", "No"],
      fields: ["needSponsorship"],
    },
    {
      id: 11,
      text: "If yes, what type of sponsorship? (e.g. H-1B, OPT, CPT, Green Card, or N/A)",
      type: "text",
      fields: ["sponsorshipType"],
    },
    {
      id: 12,
      text: "Please upload your resume.",
      type: "fileUpload",
      fields: ["resume"],
    },
    {
      id: 13,
      text: "Now upload your pitch video.",
      type: "fileUpload",
      fields: ["pitchVideo"],
    },
    {
      id: 14,
      text: "Here’s what I’ve collected — please confirm if everything looks good:",
      type: "summary",
    },
    {
      id: 15,
      text: "Would you like to submit this information?",
      type: "confirm",
    },
    {
      id: 16,
      text: "Submitted successfully! Thank you, Builder — the DevLabs team will review your details soon.",
      type: "end",
    },
  ];

  useEffect(() => {
    if (messages.length === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages([{ sender: "bot", text: chatFlow[0].text }]);
        setIsTyping(false);
      }, 400);
    }
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);

  const handleSend = (customInput?: string) => {
    const value = customInput || input.trim();
    if (!value) return;
    const currentStep = chatFlow[step];
    const requiredFields = currentStep.fields || [];

    try {
      if (requiredFields.length > 1) {
        const parts = value.split(",").map((v) => v.trim());
        const tempData: any = {};
        requiredFields.forEach(
          (field, i) => (tempData[field] = parts[i] || ""),
        );
        chatSchema
          .pick(
            requiredFields.reduce((a, f) => ({ ...a, [f]: true }), {} as any),
          )
          .parse(tempData);
      } else {
        const field = requiredFields[0];
        chatSchema.pick({ [field]: true }).parse({ [field]: value });
      }

      const normalizeValue = (field: string, v: string) => {
        if (field === "website" && v.trim().toLowerCase() === "n/a") return "";
        if (field === "phone") {
          const digits = v.replace(/\D/g, "");
          return digits.length === 10 ? `+1${digits}` : v;
        }
        if (field === "linkedin" || field === "website") return normalizeUrl(v);
        return v;
      };

      setFormData((prev) => {
        const newData = { ...prev };
        requiredFields.forEach((f, i) => {
          const piece = value.split(",")[i]?.trim() ?? value;
          newData[f] = normalizeValue(f, piece);
        });
        return newData;
      });

      setMessages((prev) => [...prev, { sender: "user", text: value }]);
      setInput("");
      proceed();
    } catch (error) {
      if (error instanceof z.ZodError) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: error.errors[0].message },
        ]);
      }
    }
  };

  const proceed = () => {
    setIsTyping(true);
    setTimeout(() => {
      setStep((prev) => {
        const next = prev + 1;
        if (chatFlow[next]) {
          setMessages((prevM) => [
            ...prevM,
            { sender: "bot", text: chatFlow[next].text },
          ]);
        }
        setIsTyping(false);
        return next;
      });
    }, 500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isResume = chatFlow[step].fields.includes("resume");
    const isPitch = chatFlow[step].fields.includes("pitchVideo");

    setFormData((prev) => ({
      ...prev,
      ...(isResume ? { resume: file.name } : {}),
      ...(isPitch ? { pitchVideo: file.name } : {}),
    }));

    setMessages((prev) => [
      ...prev,
      { sender: "user", text: `Uploaded: ${file.name}` },
    ]);

    if (isPitch) {
      proceed();
    } else {
      proceed();
    }
  };

  const submitExpoUser = async () => {
    try {
      const res = await fetch("/api/expo/saveUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: chatFlow[16].text },
        ]);
        setIsConfirmed(true);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "❌ There was an issue submitting your info.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "bot", text: "❌ Failed to connect to server." },
      ]);
    }
  };

  return (
    <div className="w-full max-w-[90vw] md:max-w-3xl lg:max-w-4xl h-[600px] flex flex-col bg-neutral-900/70 border border-dashed border-neutral-700 rounded-2xl shadow-lg p-6 backdrop-blur-md text-white overflow-hidden">
      <h1 className="text-2xl font-semibold text-orange-500 mb-4 text-center">
        DevBot — Builder Onboarding
      </h1>

      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-neutral-700 scroll-smooth"
      >
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`flex items-end ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.sender === "bot" && (
              <img
                src={logo}
                alt="DevBot"
                className="w-8 h-8 rounded-full mr-2 border border-neutral-700"
              />
            )}
            <div
              className={`px-4 py-2 rounded-2xl max-w-[80%] text-sm ${
                msg.sender === "bot"
                  ? "bg-neutral-800 text-gray-200 border border-neutral-700"
                  : "bg-orange-500 text-black font-medium"
              }`}
            >
              {msg.text}
            </div>
          </motion.div>
        ))}

        {isTyping && (
          <div className="flex items-center text-sm text-gray-400 mt-2">
            <img
              src={logo}
              alt="DevBot"
              className="w-6 h-6 rounded-full mr-2 border border-neutral-700"
            />
            <motion.span
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              DevBot is typing...
            </motion.span>
          </div>
        )}

        {/* Summary Step */}
        {chatFlow[step]?.type === "summary" && (
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 mt-2 text-xs text-gray-300 space-y-1">
            {Object.entries(formData).map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between border-b border-neutral-700/50 py-1"
              >
                <span className="capitalize">{k}</span>
                <span className="text-gray-100">{String(v)}</span>
              </div>
            ))}
            <button
              className="mt-3 px-4 py-2 bg-orange-500 text-black rounded-lg font-medium hover:bg-orange-600"
              onClick={proceed}
            >
              Looks good
            </button>
          </div>
        )}

        {/* Confirm Step */}
        {chatFlow[step]?.type === "confirm" && !isConfirmed && (
          <div className="flex gap-3 mt-3">
            <button
              onClick={() => {
                setMessages((prev) => [
                  ...prev,
                  { sender: "user", text: "Yes, submit it!" },
                ]);
                submitExpoUser();
              }}
              className="px-4 py-2 bg-orange-500 text-black font-medium rounded-lg hover:bg-orange-600"
            >
              Yes, submit
            </button>
            <button
              onClick={() => {
                setMessages((prev) => [
                  ...prev,
                  { sender: "user", text: "No, restart" },
                ]);
                setFormData({});
                setStep(0);
                setMessages([{ sender: "bot", text: chatFlow[0].text }]);
              }}
              className="px-4 py-2 bg-neutral-700 text-gray-300 rounded-lg hover:bg-neutral-600"
            >
              Restart
            </button>
          </div>
        )}
      </div>

      {/* Input section */}
      {chatFlow[step]?.type === "text" ||
      chatFlow[step]?.type === "email" ||
      chatFlow[step]?.type === "number" ||
      chatFlow[step]?.type === "tel" ||
      chatFlow[step]?.type === "url" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex space-x-2 mt-4"
        >
          <input
            type={chatFlow[step]?.type || "text"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer..."
            className="flex-1 p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className={`px-5 py-2 rounded-lg font-medium ${
              input.trim()
                ? "bg-orange-500 hover:bg-orange-600 text-black"
                : "bg-orange-900 opacity-60 cursor-not-allowed"
            }`}
          >
            Send
          </button>
        </form>
      ) : null}

      {chatFlow[step]?.type === "select" && (
        <select
          value={input}
          onChange={(e) => {
            const value = e.target.value;
            setInput(value);
            if (value) handleSend(value);
          }}
          className="w-full p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white focus:ring-2 focus:ring-orange-500 mt-4"
        >
          <option value="">Select an option</option>
          {chatFlow[step].options.map((opt: string, i: number) => (
            <option key={i} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {chatFlow[step]?.type === "boolean" && (
        <div className="flex gap-3 mt-4">
          {chatFlow[step].options.map((opt: string, i: number) => (
            <button
              key={i}
              onClick={(e) => {
                e.preventDefault();
                setInput(opt);
                handleSend(opt);
              }}
              className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-black font-medium"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {chatFlow[step]?.type === "fileUpload" && (
        <div className="flex flex-col gap-4 mt-4">
          <p className="text-sm text-gray-300 mb-1">{chatFlow[step].text}</p>
          <input
            type="file"
            accept={
              chatFlow[step].fields.includes("resume")
                ? ".pdf,.doc,.docx"
                : "video/*"
            }
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-300 
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0 
                      file:text-sm file:font-semibold
                      file:bg-orange-600 file:text-black
                      hover:file:bg-orange-700 transition"
          />
        </div>
      )}
    </div>
  );
}
