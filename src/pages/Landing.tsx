import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Eye, Wifi, Bell, Cpu, Users, ArrowRight, Lock, Zap, MonitorSmartphone, Sun, Moon, Sparkles, Database, Activity, Flame, Brain, Volume2, ChevronRight, Award, GraduationCap } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: Eye,
    title: 'Real-Time Object Detection',
    description: 'COCO-SSD powered detection identifies 80+ object types with adjustable sensitivity for precise monitoring.',
  },
  {
    icon: Cpu,
    title: 'Multimodal Saliency Engine',
    description: 'Fuses visual saliency, audio analysis, and object detection into a unified attention score.',
  },
  {
    icon: Bell,
    title: 'Smart Alert System',
    description: 'Instant alerts for detected activities, speech events, and custom wake words with household notifications.',
  },
  {
    icon: Users,
    title: 'Household Management',
    description: 'Invite family members, manage permissions, and share real-time monitoring across your household.',
  },
  {
    icon: Shield,
    title: 'Activity Recognition',
    description: 'AI-powered inference identifies what people are doing — eating, working, playing — in real time.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Live Speech Transcription',
    description: 'Built-in speech-to-text captures conversations and voice commands directly on the camera feed.',
  },
];

const securityBadges = [
  { icon: Lock, label: 'End-to-End Encryption', description: 'All data is encrypted in transit and at rest' },
  { icon: Shield, label: 'Privacy First', description: 'Video processed locally — never stored on external servers' },
  { icon: Wifi, label: 'Secure Connection', description: 'Authenticated sessions with role-based access control' },
  { icon: Zap, label: 'Real-Time Processing', description: 'Edge computing ensures zero-latency detection' },
];

const steps = [
  { step: '01', title: 'Create Household', description: 'Sign up and set up your household with a unique invite code for family members.' },
  { step: '02', title: 'Start Monitoring', description: 'Enable your camera and microphone — the system begins detecting objects and analyzing audio immediately.' },
  { step: '03', title: 'Get Smart Alerts', description: 'Receive real-time notifications when priority objects, speech, or unusual activity is detected.' },
  { step: '04', title: 'Review & Respond', description: 'Check the fused detection view, review alert history, and take action from anywhere.' },
];

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('safewatch-dark-mode');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return document.documentElement.classList.contains('dark');
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">MSDSystem</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                document.documentElement.classList.toggle('dark');
                setDarkMode(prev => {
                  localStorage.setItem('safewatch-dark-mode', String(!prev));
                  return !prev;
                });
              }}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4 text-foreground" /> : <Moon className="w-4 h-4 text-foreground" />}
            </button>
            {!loading && (
              user ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Go to Dashboard
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/auth')}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => navigate('/auth')}
                    className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative hero-gradient overflow-hidden">
        {/* HUD scan grid backdrop */}
        <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 animate-pulse" />

        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={0}>
            <span className="inline-flex items-center gap-2 text-sm font-mono font-semibold bg-primary/10 border border-primary/30 text-primary px-4 py-2 rounded-full mb-8">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              LIVE · AI MONITORING · v2.1
            </span>
          </motion.div>
          <motion.h1
            className="text-5xl md:text-6xl font-extrabold text-foreground leading-[1.05] tracking-tight mb-6"
            initial="hidden" animate="visible" variants={fadeIn} custom={1}
          >
            Home security that
            <br />
            <span className="text-primary">actually sees, hears</span>
            <br />
            <span className="text-accent">and understands.</span>
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed"
            initial="hidden" animate="visible" variants={fadeIn} custom={2}
          >
            A DOST-inspired multimodal AI that fuses vision, audio, and facial-expression signals to
            catch fire, falls, screams, and family distress the second they happen — and gets smarter
            with every 👍 you give it.
          </motion.p>
          <motion.div
            className="flex items-center justify-center gap-4 flex-wrap"
            initial="hidden" animate="visible" variants={fadeIn} custom={3}
          >
            <button
              onClick={() => navigate(user ? '/dashboard' : '/auth')}
              className="inline-flex items-center gap-2 text-lg font-semibold bg-primary text-primary-foreground px-8 py-4 rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/30"
            >
              {user ? 'Open Dashboard' : 'Get Started Free'}
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/expert')}
              className="inline-flex items-center gap-2 text-lg font-semibold border-2 border-primary/40 text-primary px-8 py-4 rounded-xl hover:bg-primary/5 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Enter Expert Mode
            </button>
          </motion.div>
          <motion.p
            className="mt-6 text-sm font-mono text-muted-foreground"
            initial="hidden" animate="visible" variants={fadeIn} custom={4}
          >
            No credit card. Runs on your webcam. Thesis-grade research, home-grade UX.
          </motion.p>
        </div>
      </section>

      {/* Detection triad — the "real deal" security company section */}
      <section className="border-y border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-sm font-mono uppercase tracking-widest text-primary mb-2">THREE SENSES · ONE VERDICT</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground">
              What MSDSystem watches for
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Flame, color: 'text-destructive', bg: 'bg-destructive/10', ring: 'border-destructive/30', title: 'Fire & Smoke', desc: 'Color signature + flame flicker + smoke coverage + visibility drop. Rejects TV fires, candles, and posters.' },
              { icon: Brain, color: 'text-warning', bg: 'bg-warning/10', ring: 'border-warning/30', title: 'Facial Distress', desc: 'Pretrained FER model reads sad, fearful, angry, disgusted from every face — averaged over 5 frames.' },
              { icon: Volume2, color: 'text-accent', bg: 'bg-accent/10', ring: 'border-accent/30', title: 'Audio Emergencies', desc: 'YAMNet AudioSet classifier catches screams, crying, glass break — even when the camera sees nothing.' },
            ].map((b, i) => (
              <motion.div
                key={b.title}
                className={`rounded-2xl border-2 ${b.ring} bg-background p-6 space-y-3`}
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={i}
              >
                <div className={`w-12 h-12 rounded-xl ${b.bg} flex items-center justify-center`}>
                  <b.icon className={`w-6 h-6 ${b.color}`} />
                </div>
                <h3 className="text-lg font-bold">{b.title}</h3>
                <p className="text-base text-muted-foreground leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-border bg-background">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {securityBadges.map((badge, i) => (
              <motion.div
                key={badge.label}
                className="text-center space-y-2"
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={i}
              >
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
                  <badge.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="text-base font-bold text-foreground">{badge.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{badge.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* THE SCIENCE — thesis credibility */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-accent mb-3">
            <GraduationCap className="w-4 h-4" /> THE SCIENCE
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            Not a demo. A research-backed pipeline.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Every detector is a real pretrained model with a published lineage — plus a client-side
            adaptive threshold loop that learns from your household's feedback.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: 'face-api.js · TinyFaceDetector + FaceExpressionNet', body: 'Trained on FER+/AffectNet supersets. 7-class emotion probability → weighted distress score.' },
            { title: 'YAMNet (Google)', body: 'MobileNet audio classifier trained on Google AudioSet (521 classes, 2M+ clips).' },
            { title: 'COCO-SSD (MobileNet backbone)', body: 'Single-shot detector on 80 COCO object classes, quantised for browser inference.' },
            { title: 'Adaptive threshold learning', body: 'Per-household 👍/👎 feedback tunes each detector confidence gate every 60s. Fewer false alarms over time — no server retraining.' },
          ].map((s, i) => (
            <motion.div
              key={s.title}
              className="rounded-2xl border border-border bg-card p-6 hover:border-primary/40 transition"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={i}
            >
              <div className="flex items-start gap-3 mb-2">
                <Award className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <h3 className="text-lg font-bold">{s.title}</h3>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed pl-8">{s.body}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-sm text-muted-foreground text-center">
          <span className="font-semibold text-foreground">Honest accuracy note:</span> browser-side pretrained models
          typically run at 70–90% on unseen home footage. The adaptive-threshold loop cuts <em>your</em> false-alarm
          rate over time as you label detections. No AI vendor can honestly promise ±1% failure on live video.
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            Everything You Need for
            <span className="text-primary"> Smart Monitoring</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            A comprehensive suite of detection and analysis tools working together in real time.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="bg-card rounded-2xl border border-border p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={i}
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
              How It <span className="text-primary">Works</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Get up and running in minutes with a simple setup process.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.step}
                className="relative text-center"
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={i}
              >
                <div className="text-5xl font-extrabold text-primary/10 mb-3">{step.step}</div>
                <h3 className="text-base font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-4 top-8 w-5 h-5 text-border" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <motion.div
          className="bg-primary/5 border border-primary/20 rounded-3xl p-12"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} custom={0}
        >
          <h2 className="text-3xl font-extrabold text-foreground mb-4">
            Ready to Secure Your Home?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
            Start monitoring in minutes with our intelligent multimodal detection system.
          </p>
          <button
            onClick={() => navigate(user ? '/dashboard' : '/auth')}
            className="inline-flex items-center gap-2 text-base font-semibold bg-primary text-primary-foreground px-8 py-3.5 rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            {user ? 'Open Dashboard' : 'Create Free Account'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Eye className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">MSDSystem</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Multimodal Saliency Detection System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
