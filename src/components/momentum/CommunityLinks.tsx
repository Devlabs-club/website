import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MessageSquare, ArrowUpRight, Calendar, X, Mail } from "lucide-react";

export function CommunityLinks() {
  const [isDiscordModalOpen, setIsDiscordModalOpen] = useState(false);

  const handleEmailClick = () => {
    const subject = encodeURIComponent("Momentum Discord Access");
    const body = encodeURIComponent("Hey team,\n\nI've joined the Discord server. My Discord ID is: [Insert your Discord ID here]\n\nPlease add me to the private #momentum channel.\n\nThanks!");
    window.location.href = `mailto:people@devlabs.club?subject=${subject}&body=${body}`;
  };

  return (
    <div className="mt-12">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-seasons text-2xl text-white">Join Our Community</h2>
          <p className="text-sm text-white/60">
            Connect with fellow builders, share your progress, and get support.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Discord Card */}
        <motion.button
          onClick={() => setIsDiscordModalOpen(true)}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-500/5 p-4 backdrop-blur-sm transition-all hover:bg-indigo-500/10 hover:border-indigo-500/60 sm:p-6 overflow-hidden text-left"
        >
          <div className="absolute -left-16 -top-16 h-32 w-32 rounded-full bg-indigo-500/10 blur-[32px] pointer-events-none" />
          <div className="flex items-center gap-4 sm:gap-6 relative z-10">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-seasons text-lg text-white sm:text-xl">
                Discord
              </h3>
              <p className="mt-1 max-w-xl text-sm text-white/60">
                Chat with fellow hackers, form your perfect team, and get help from mentors.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex h-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 px-6 text-sm font-medium text-white transition-colors group-hover:bg-indigo-600 sm:w-auto w-full mt-2 sm:mt-0">
            Join <ArrowUpRight className="ml-2 h-4 w-4" />
          </div>
        </motion.button>

        {/* Momentum Calendar Card */}
        <motion.a
          href="https://calendar.google.com/calendar/u/2?cid=Y19iZGY1ZDQxZjJlZWJjMDFkOGViNTQ4MzM4NTA1OWY5Njc5MmY0YThkYTgyZTFiY2VlMjhjZDkzN2MwZDk0MWQ3QGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20"
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-dashed border-white/30 bg-white/5 p-4 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/50 sm:p-6 overflow-hidden text-left"
        >
          <div className="absolute -left-16 -top-16 h-40 w-40 rounded-full bg-white opacity-20 blur-[32px] pointer-events-none group-hover:opacity-40 transition-opacity duration-500" />
          <div className="flex items-center gap-4 sm:gap-6 relative z-10">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/20 relative overflow-hidden border border-white/30">
              <div className="absolute inset-0 bg-white/20 opacity-30 group-hover:opacity-50 transition-opacity" />
              <Calendar className="h-7 w-7 text-white relative z-10" />
            </div>
            <div>
              <h3 className="font-seasons text-lg text-white sm:text-xl">
                Momentum Calendar
              </h3>
              <p className="mt-1 max-w-xl text-sm text-white/60">
                Sync the official Google Calendar to get notified about all upcoming events, workshops, and the kickoff.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex h-10 shrink-0 items-center justify-center rounded-xl bg-white/80 px-6 text-sm font-medium text-black transition-colors group-hover:bg-white sm:w-auto w-full mt-2 sm:mt-0">
            Subscribe <ArrowUpRight className="ml-2 h-4 w-4" />
          </div>
        </motion.a>
      </div>
 

      {/* Discord Modal */}
      <AnimatePresence>
        {isDiscordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDiscordModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl sm:p-8"
            >
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-[64px] pointer-events-none" />
              
              <button
                onClick={() => setIsDiscordModalOpen(false)}
                className="absolute right-4 top-4 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-500/20 p-3">
                <MessageSquare className="h-10 w-10 text-indigo-400" />
              </div>

              <h3 className="mb-2 font-seasons text-2xl text-white">
                Join the Momentum Discord
              </h3>
              
              <div className="mb-8 space-y-4 text-white/70">
                <p>
                  Jump into the DevLabs Discord to connect with fellow builders, share your progress, and get support from the community.
                </p>
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-sm text-indigo-200">
                  <p>
                    <strong>Action required:</strong> Once you're in the server, shoot an email to our team with your Discord ID so we can drop you into the exclusive <code className="bg-indigo-500/20 px-1.5 py-0.5 rounded text-indigo-300">#momentum</code> private channel.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://discord.gg/J4n8e2DhEy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
                >
                  Join Discord Channel <ArrowUpRight className="h-4 w-4" />
                </a>
                <button
                  onClick={handleEmailClick}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  Send Email <Mail className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
