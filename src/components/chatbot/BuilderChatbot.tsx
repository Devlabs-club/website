import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

const logo = "/logo.svg";


export default function BuilderChatbot() {
  const [messages, setMessages] = useState<
    { sender: "bot" | "user"; text: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const chatFlow = [
  { id: 1, text: "Hey Builder, I’m DevBot, Lets get you on the onboarding process. What’s your full name and age?", type: "text", fields: ["name", "age"] },
  { id: 2, text: "Thanks. Could you share your email and phone number?(add +1 before entering your number)", type: "text", fields: ["email", "phone"] },
  { id: 3, text: "Which university or college are you attending?", type: "text", fields: ["university"] },
  { id: 4, text: "What’s your major or specialization?", type: "text", fields: ["major"] },
  { id: 5, text: "Which year are you in?", type: "select", options: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"], fields: ["yearOfStudy"] },
  { id: 6, text: "When do you expect to graduate? (e.g. 2026)", type: "number", fields: ["expectedGradYear"] },
  { id: 7, text: "Please share your LinkedIn profile URL.", type: "url", fields: ["linkedin"] },
  { id: 8, text: "Do you have a GitHub or personal website? (Type N/A if not)", type: "url", fields: ["website"] },
  { id: 9, text: "Are you eligible to work in the United States?", type: "boolean", options: ["Yes", "No"], fields: ["workEligibility"] },
  { id: 10, text: "Would you require sponsorship now or in the future?", type: "boolean", options: ["Yes", "No"], fields: ["needSponsorship"] },
  { id: 11, text: "If yes, what type of sponsorship? (e.g. H-1B, OPT, CPT, Green Card, or N/A)", type: "text", fields: ["sponsorshipType"] },
  { id: 12, text: "Please upload your resume.", type: "fileUpload", fields: ["resume"] },
  { id: 13, text: "Now upload your pitch video.", type: "fileUpload", fields: ["pitchVideo"] },
  { id: 14, text: "Thanks! That’s everything I need. The DevLabs team will review your details soon.", type: "end" },
];



  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isTyping]);




  useEffect(() => {
    if (messages.length === 0) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages([{ sender: "bot", text: chatFlow[0].text }]);
;
        setIsTyping(false);
      }, 400);
    }
  }, []);

  const handleSend = (customInput?: string) => {
    const value = customInput || input.trim();
    if (!value) return;

    const currentStep = chatFlow[step];
    const requiredFields = currentStep.fields || [];

    
    if (requiredFields.length > 1) {
      const parts = value.split(",").map((v) => v.trim());
      if (parts.length < requiredFields.length) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Please include both name and age separated by a comma. Example: John Doe, 22" },
        ]);
        setInput("");
        return;
      }

      
      if (currentStep.fields.includes("age") && isNaN(Number(parts[1]))) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Your age should be a number. Try again like: Vishal Lakshmi Narayanan, 22" },
        ]);
        setInput("");
        return;
      }
      if (currentStep.fields.includes("phone") && !/^\+?1?\s?\d{10,15}$/.test(parts[1].replace(/\s+/g, ""))) {

        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Your phone number must include +1 and 10 digits. Example: vishal@asu.edu, +1 4805551234" },
        ]);
        setInput("");
        return;
      }
    }

    if (requiredFields.length === 1) {
      const field = requiredFields[0];
      if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "That doesn’t look like a valid email. Please re-enter your email address." },
        ]);
        setInput("");
        return;
      }
      if (["linkedin", "portfolio"].includes(field) && !/^https?:\/\//.test(value) && value.toLowerCase() !== "n/a") {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Please provide a valid URL (it should start with http or https) or type N/A if none." },
        ]);
        setInput("");
        return;
      }
      if (field === "expectedGraduation" && !/^\d{4}$/.test(value)) {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Please enter a 4-digit graduation year like 2026." },
        ]);
        setInput("");
        return;
      }
    }

    const userMsg = { sender: "user", text: value };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (step < chatFlow.length - 1) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: chatFlow[step + 1].text },
        ]);
        setStep(step + 1);
        setIsTyping(false);
      }, 600);
    }
  };



  return (
    <div className="w-full max-w-2xl h-[600px] flex flex-col bg-neutral-900/70 border border-dashed border-neutral-700 rounded-2xl shadow-lg p-6 backdrop-blur-md text-white overflow-hidden">

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
            className={`flex items-end ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
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
        
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex flex-col mt-4 sticky bottom-0 bg-neutral-900/70 backdrop-blur-md pb-2 pt-2 space-y-3"
      >
        {chatFlow[step]?.type === "text" ||
        chatFlow[step]?.type === "email" ||
        chatFlow[step]?.type === "number" ||
        chatFlow[step]?.type === "tel" ||
        chatFlow[step]?.type === "url" ? (
          <div className="flex space-x-2">
            <input
              type={chatFlow[step]?.type || "text"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1 p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className={`px-5 py-2 rounded-lg font-medium transition-colors ${
                input.trim()
                  ? "bg-orange-500 hover:bg-orange-600 text-black"
                  : "bg-orange-900 opacity-60 cursor-not-allowed"
              }`}
            >
              Send
            </button>
          </div>
        ) : null}

        {chatFlow[step]?.type === "select" && (
          <select
            value={input}
            onChange={(e) => {
              const value = e.target.value;
              setInput(value);
              if (value) handleSend(value);
            }}
            className="w-full p-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white focus:ring-2 focus:ring-orange-500 outline-none"
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
          <div className="flex gap-3">
            {chatFlow[step].options.map((opt: string, i: number) => (
              <button
                key={i}
                onClick={(e) => {
                  e.preventDefault();
                  setInput(opt);
                  handleSend(opt);
                }}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-black font-medium transition"
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </form>

      {chatFlow[step]?.type === "fileUpload" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-300 mb-1">{chatFlow[step].text}</p>

          <input
            type="file"
            accept={
              chatFlow[step].fields.includes("resume")
                ? ".pdf,.doc,.docx"
                : "video/*"
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleSend(`Uploaded: ${file.name}`);
              }
            }}
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
