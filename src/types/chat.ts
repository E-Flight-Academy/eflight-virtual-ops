export interface ScheduleBooking {
  id: number;
  timeFrom: string;
  timeTo: string;
  type: string;
  student: string;
  studentFull: string;
  aircraft: string;
  status: string;
  comments: string | null;
  lessonPlan: string | null;
  lessonStatus: string | null;
  isAssessment: boolean;
}

export interface ScheduleDay {
  date: string;
  wingsLink: string;
  bookings: ScheduleBooking[];
}

export interface BookingFlight {
  id: number;
  departName: string;
  arriveName: string;
  offBlock: string | null;
  onBlock: string | null;
  airborne: string | null;
  touchdown: string | null;
  comments: string | null;
}

export interface BookingLesson {
  id: number;
  planName: string | null;
  isAssessment: boolean;
  description: string | null;
  prep: string | null;
  briefing: string | null;
  status: string | null;
  comments: string | null;
  flights: BookingFlight[];
  records: LessonRecord[];
}

export interface DocumentValidity {
  name: string;
  expires: string;
  daysRemaining: number;
  isExpired: boolean;
}

export interface UserDocuments {
  userName: string;
  documents: DocumentValidity[];
}

export interface AircraftRemark {
  id: number;
  remark: string;
  createdAt: string;
  daysAgo: number;
  isNew: boolean;
  isOpen: boolean;
}

export interface AircraftStatus {
  callSign: string;
  serviceable: boolean;
  documents: DocumentValidity[];
  openRemarks: AircraftRemark[];
}

export interface LessonRecord {
  objectiveSummary: string;
  categoryName: string;
  score: number | null;
  comments: string | null;
}

export interface PreviousLesson {
  bookingId: number;
  date: string;
  planName: string;
  isAssessment: boolean;
  status: string | null;
}

export interface BookingDetail {
  id: number;
  date: string;
  timeFrom: string;
  timeTo: string;
  type: string;
  status: string;
  student: string;
  studentUserId: number | null;
  studentEmail: string | null;
  instructor: string;
  aircraft: string;
  comments: string | null;
  wingsLink: string;
  lessons: BookingLesson[];
  report: {
    remarks: string | null;
    landings: number | null;
    fuelLtrs: number | null;
  } | null;
  userDocuments: UserDocuments[];
  aircraftStatus: AircraftStatus | null;
  previousLesson: PreviousLesson | null;
}

export interface StudentLessonItem {
  bookingId: number;
  date: string;
  planName: string | null;
  isAssessment: boolean;
  status: string | null;
  instructor: string | null;
  avgScore: number | null;
}

export interface StudentLessonCourse {
  courseName: string;
  lessons: StudentLessonItem[];
}

export interface StudentLessonsData {
  studentName: string;
  studentUserId: number;
  courses: StudentLessonCourse[];
  totalLessons: number;
}

export interface DocValidityData {
  userName: string;
  documents: DocumentValidity[];
}

export type StructuredContent =
  | { type: "schedule"; data: ScheduleDay[]; summary: string }
  | { type: "booking-detail"; data: BookingDetail; summary: string }
  | { type: "student-lessons"; data: StudentLessonsData; summary: string }
  | { type: "doc-validity"; data: DocValidityData; summary: string };

export interface Message {
  role: "user" | "assistant";
  content: string;
  logId?: string;
  rating?: "👍" | "👎";
  structured?: StructuredContent;
}

export interface FlowOption {
  name: string;
  label: string;
  labelNl: string;
  labelDe: string;
  icon: string | null;
  endAction?: string;
  capability: string | null;
}

export interface FlowStep {
  name: string;
  message: string;
  messageNl: string;
  messageDe: string;
  nextDialogFlow: FlowOption[];
  endAction: "Continue Flow" | "Start AI Chat" | "Capability Action" | "Login";
  contextKey: string;
  endPrompt: string;
  endPromptNl: string;
  endPromptDe: string;
  relatedFaqQuestion: string;
  relatedFaqQuestionNl: string;
  relatedFaqQuestionDe: string;
  relatedFaqAnswer: string;
  relatedFaqAnswerNl: string;
  relatedFaqAnswerDe: string;
  relatedFaqUrl: string;
  order: number;
  trigger: string | null;
}

export interface CardAction {
  name: string;
  label: string;
  icon: string | null;
  contextKey: string;
  endPrompt: string;
}

export type FlowPhase = "loading" | "active" | "completed" | "skipped";

export interface KbStatus {
  status: "synced" | "not_synced" | "loading";
  fileCount: number;
  fileNames: string[];
  lastSynced: string | null;
  faqCount?: number;
  websitePageCount?: number;
  searchOrder?: string[];
  user?: {
    email: string | null;
    roles: string[];
    folders: string[];
    capabilities?: string[];
    override?: boolean;
  };
  filteredFileCount?: number;
  filteredFileNames?: string[];
}
