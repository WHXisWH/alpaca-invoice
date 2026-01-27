'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  FileText,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Layers,
  Receipt,
} from 'lucide-react';
import { MotionContainer, MotionItem } from '@/components/ui/motion';

export default function HomePage() {
  return (
    <MotionContainer>
      <MotionItem>
        <section
          className="relative min-h-screen overflow-hidden border-b border-white/10 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950 px-12 py-24 text-white"
        >
          <div className="absolute left-10 top-8 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/70">
            <Sparkles className="h-3.5 w-3.5 text-accent-400" />
            Zero-Knowledge Finance
          </div>
          <div className="absolute right-0 top-0 h-96 w-96 translate-x-1/3 -translate-y-1/3 rounded-full bg-accent-500/25 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 translate-y-1/2 rounded-full bg-purple-500/25 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_60%)]" />
          <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white/5 to-transparent" />

          <div className="relative mx-auto flex min-h-[calc(100vh-12rem)] max-w-7xl items-center">
            <div className="grid w-full gap-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
                  Alpaca Invoice
                  <span className="block text-primary-200">Private Check Operations</span>
                </h1>
                <p className="mt-6 max-w-xl text-base text-primary-200 md:text-lg">
                  A private check console for finance teams, secured by Aleo zero-knowledge proofs.
                </p>
                <div className="mt-10 flex flex-wrap gap-4">
                  <Link
                    href="/dashboard"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/30 transition-all hover:-translate-y-0.5 hover:bg-accent-600"
                  >
                    Enter Console
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-12 flex flex-wrap gap-4 text-xs text-primary-200/80">
                  <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Zero-Knowledge Encryption</div>
                  <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">On-Chain Verifiable</div>
                  <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1">Audit Ready</div>
                </div>
              </div>
              <div className="relative">
                <div className="surface-card p-7 text-primary-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-primary-500">Live Overview</p>
                      <p className="text-2xl font-semibold text-primary-900">Enterprise Check Flow</p>
                    </div>
                    <span className="rounded-full bg-success-100/80 px-3 py-1 text-xs font-semibold text-success-700">
                      Live
                    </span>
                  </div>
                  <div className="mt-6 grid gap-4">
                    <div className="flex items-center justify-between rounded-xl border border-primary-200/60 bg-white/70 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-100/80 ring-1 ring-accent-200/40">
                          <FileText className="h-5 w-5 text-accent-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-primary-900">Enterprise Checks</p>
                          <p className="text-xs text-primary-500">Encrypted submit · Auto audit</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary-100/80 px-3 py-1 text-xs font-semibold text-primary-600">
                        Active
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-primary-200/60 bg-white/70 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-info-100/80 ring-1 ring-info-200/40">
                          <CreditCard className="h-5 w-5 text-info-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-primary-900">Instant Settlement</p>
                          <p className="text-xs text-primary-500">On-chain confirmation · Real-time status</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary-100/80 px-3 py-1 text-xs font-semibold text-primary-600">
                        Verified
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-10 -right-10 hidden lg:block">
                  <Image
                    src="/images/mascot/mascot-rich.png"
                    alt="Paca premium"
                    width={160}
                    height={160}
                    className="drop-shadow-2xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </MotionItem>

      <motion.section
        className="min-h-screen border-b border-white/10 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950 px-12 py-24 text-white"
        initial={{ opacity: 0, y: 60, filter: 'blur(10px)' }}
        whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ amount: 0.5, once: true }}
      >
        <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-7xl flex-col justify-center gap-12">
          <div className="rounded-3xl border border-white/10 bg-white/10 p-12 text-white/90 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/60">Feature Ribbon</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">A panoramic view of the platform</h2>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/20"
              >
                Explore the console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 overflow-hidden rounded-2xl border border-white/15 bg-white/5">
              <div className="flex flex-wrap items-center justify-between gap-6 px-8 py-6 text-sm text-white/70">
                {[
                  'Private check issuance',
                  'Encrypted counterparties',
                  'Proof-backed approvals',
                  'Real-time payment status',
                  'Audit-ready receipts',
                  'Role-based access controls',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent-400" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-12 text-white/90 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/60">Interactive Gallery</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Explore the console flow</h2>
                <p className="mt-3 text-sm text-white/70">Hover to highlight each stage of the check lifecycle.</p>
              </div>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: 'Command Center',
                  description: 'All checks, statuses, and approvals in one glass dashboard.',
                  icon: Layers,
                },
                {
                  title: 'Secure Issuance',
                  description: 'Create encrypted checks with policy-aware validation.',
                  icon: ShieldCheck,
                },
                {
                  title: 'Audit Trail',
                  description: 'Export proof-backed receipts for stakeholders instantly.',
                  icon: Receipt,
                },
              ].map((card) => (
                <div
                  key={card.title}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-8 transition-all hover:-translate-y-1 hover:bg-white/10 hover:shadow-[0_20px_45px_-28px_rgba(0,0,0,0.5)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 transition-colors group-hover:bg-accent-500/20">
                    <card.icon className="h-5 w-5 text-white/80 group-hover:text-accent-300" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{card.title}</h3>
                  <p className="mt-2 text-sm text-white/70">{card.description}</p>
                  <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                    Preview module · Motion-ready · ZK secure
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <MotionItem>
        <section
          className="min-h-screen bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950 px-12 py-24 text-white"
        >
          <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-7xl items-center justify-center">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-14 text-center text-white/90 backdrop-blur-xl">
              <h2 className="text-3xl font-semibold text-white">Ready to enter the console?</h2>
              <p className="mt-4 text-sm text-white/70">Private check operations, in one calm workspace.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent-500/30 transition-all hover:-translate-y-0.5 hover:bg-accent-600"
                >
                  Enter Console
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </MotionItem>
    </MotionContainer>
  );
}
