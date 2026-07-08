import { Schema, model } from 'mongoose';

export type QuestionType = 'mcq' | 'fib' | 'case_study' | 'simulation';

export interface IQuestionOption {
  text: string;
  // MCQ: 1 or 0. Case study: graded weights (best 1.0 / acceptable 0.5 / poor 0).
  weight: number;
}

export interface IQuestionBlank {
  acceptedAnswers: string[]; // matched case/whitespace-insensitively (PRD §3.5)
}

export interface ISimulationChoice {
  choiceId: string;
  text: string;
  impact: number; // 0..1 decision-impact rating
  nextNodeId?: string;
}

export interface ISimulationNode {
  nodeId: string;
  prompt: string;
  choices: ISimulationChoice[];
}

export interface IQuestion {
  type: QuestionType;
  version: number;
  tags: string[];
  actReference?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  body: string;
  options?: IQuestionOption[];
  blanks?: IQuestionBlank[];
  nodes?: ISimulationNode[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    type: { type: String, required: true, enum: ['mcq', 'fib', 'case_study', 'simulation'] },
    version: { type: Number, default: 1 },
    tags: { type: [String], default: [] },
    actReference: { type: String },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    body: { type: String, required: true },
    options: [{ text: { type: String, required: true }, weight: { type: Number, required: true } }],
    blanks: [{ acceptedAnswers: { type: [String], required: true } }],
    nodes: [
      {
        nodeId: { type: String, required: true },
        prompt: { type: String, required: true },
        choices: [
          {
            choiceId: { type: String, required: true },
            text: { type: String, required: true },
            impact: { type: Number, required: true },
            nextNodeId: { type: String },
          },
        ],
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

questionSchema.index({ type: 1, isActive: 1 });
// Text index only on non-sensitive fields (blueprint §6) — never on answer keys.
questionSchema.index({ tags: 'text' });

export const Question = model<IQuestion>('Question', questionSchema);
