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
    {
      id: 1,
      text: "Hey there 👋 I’m DevBot from DevLabs — let’s get you onboarded as a builder! First things first — what’s your full name?",
      type: "text",
    },
    {
      id: 2,
      text: "Got it. Can you share your age?",
      type: "number",
    },
    {
      id: 3,
      text: "Thanks! What’s your email address?",
      type: "email",
    },
    {
      id: 4,
      text: "What’s your phone number? +1 (___)___-____",
      type: "tel",
    },
    {
      id: 5,
      text: "What’s your major or specialization?",
      type: "text",
    },
    {
      id: 6,
      text: "Which year of study are you in?",
      type: "select",
      options: ["Freshman", "Sophomore", "Junior", "Senior", "Masters", "PhD"],
    },
    {
      id: 7,
      text: "When do you expect to graduate? (Month & Year)",
      type: "text",
    },
    {
      id: 8,
      text: "Can you share your LinkedIn profile URL?",
      type: "url",
    },
    {
      id: 9,
      text: "Do you have a GitHub, portfolio, or personal website? (Optional — type N/A if none)",
      type: "url",
    },
    {
      id: 10,
      text: "Are you eligible to work in the United States?",
      type: "boolean",
      options: ["Yes", "No"],
    },
    {
      id: 11,
      text: "Would you require any form of sponsorship now or in the future?",
      type: "boolean",
      options: ["Yes", "No"],
    },
    {
      id: 12,
      text: "If yes, what type of sponsorship would you require? (e.g., H-1B, OPT, CPT, Green Card, Other — or type N/A)",
      type: "text",
    },
    {
      id: 13,
      text: "Perfect 🎉 Thanks for providing all that information — your onboarding is complete! The DevLabs team will process your details for builder ranking and opportunities.",
      type: "end",
    },
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

    const userMsg = { sender: "user", text: value };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (step < chatFlow.length - 1) {
      setIsTyping(true);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: chatFlow[step + 1].text || chatFlow[step + 1] },
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

        

    </div>
  );
}
