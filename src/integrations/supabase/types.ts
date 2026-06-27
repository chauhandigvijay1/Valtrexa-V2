export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json | null;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_generations: {
        Row: {
          cost: number | null;
          created_at: string;
          id: string;
          kind: string;
          model: string | null;
          prompt: string | null;
          provider: string | null;
          related_entity: string | null;
          related_id: string | null;
          response: string | null;
          tokens_input: number | null;
          tokens_output: number | null;
          user_id: string;
        };
        Insert: {
          cost?: number | null;
          created_at?: string;
          id?: string;
          kind: string;
          model?: string | null;
          prompt?: string | null;
          provider?: string | null;
          related_entity?: string | null;
          related_id?: string | null;
          response?: string | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          user_id: string;
        };
        Update: {
          cost?: number | null;
          created_at?: string;
          id?: string;
          kind?: string;
          model?: string | null;
          prompt?: string | null;
          provider?: string | null;
          related_entity?: string | null;
          related_id?: string | null;
          response?: string | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      analytics: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          metric: string;
          user_id: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          date?: string;
          id?: string;
          metric: string;
          user_id: string;
          value?: number;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          metric?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          created_at: string;
          event_name: string;
          id: string;
          occurred_at: string;
          properties: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_name: string;
          id?: string;
          occurred_at?: string;
          properties?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          id?: string;
          occurred_at?: string;
          properties?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      application_events: {
        Row: {
          application_id: string;
          created_at: string;
          description: string | null;
          event_type: string;
          id: string;
          occurred_at: string;
          user_id: string;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          description?: string | null;
          event_type: string;
          id?: string;
          occurred_at?: string;
          user_id: string;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          description?: string | null;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      applications: {
        Row: {
          applied_at: string | null;
          company_name: string;
          created_at: string;
          id: string;
          job_id: string | null;
          notes: string | null;
          resume_version_id: string | null;
          role_title: string;
          source: string | null;
          status: Database["public"]["Enums"]["application_status"];
          updated_at: string;
          user_id: string;
          tier: string | null;
          match_score: number | null;
          package_generated: boolean | null;
        };
        Insert: {
          applied_at?: string | null;
          company_name: string;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          notes?: string | null;
          resume_version_id?: string | null;
          role_title: string;
          source?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
          user_id: string;
          tier?: string | null;
          match_score?: number | null;
          package_generated?: boolean | null;
        };
        Update: {
          applied_at?: string | null;
          company_name?: string;
          created_at?: string;
          id?: string;
          job_id?: string | null;
          notes?: string | null;
          resume_version_id?: string | null;
          role_title?: string;
          source?: string | null;
          status?: Database["public"]["Enums"]["application_status"];
          updated_at?: string;
          user_id?: string;
          tier?: string | null;
          match_score?: number | null;
          package_generated?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_fk";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_resume_version_fk";
            columns: ["resume_version_id"];
            isOneToOne: false;
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_resume_version_id_fkey";
            columns: ["resume_version_id"];
            isOneToOne: false;
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          application_id: string | null;
          created_at: string;
          due_at: string | null;
          id: string;
          notes: string | null;
          score: number | null;
          status: string;
          title: string;
          type: string | null;
          updated_at: string;
          url: string | null;
          user_id: string;
        };
        Insert: {
          application_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          notes?: string | null;
          score?: number | null;
          status?: string;
          title: string;
          type?: string | null;
          updated_at?: string;
          url?: string | null;
          user_id: string;
        };
        Update: {
          application_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          notes?: string | null;
          score?: number | null;
          status?: string;
          title?: string;
          type?: string | null;
          updated_at?: string;
          url?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_brain: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          location: string | null;
          remote_preference: string | null;
          salary_expectations: Json | null;
          communication_style: string | null;
          career_goals: string | null;
          skills: Json | null;
          projects: Json | null;
          education: Json | null;
          certifications: Json | null;
          achievements: Json | null;
          preferred_roles: Json | null;
          github_url: string | null;
          linkedin_url: string | null;
          portfolio_url: string | null;
          primary_resume_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          remote_preference?: string | null;
          salary_expectations?: Json | null;
          communication_style?: string | null;
          career_goals?: string | null;
          skills?: Json | null;
          projects?: Json | null;
          education?: Json | null;
          certifications?: Json | null;
          achievements?: Json | null;
          preferred_roles?: Json | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          primary_resume_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          remote_preference?: string | null;
          salary_expectations?: Json | null;
          communication_style?: string | null;
          career_goals?: string | null;
          skills?: Json | null;
          projects?: Json | null;
          education?: Json | null;
          certifications?: Json | null;
          achievements?: Json | null;
          preferred_roles?: Json | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          primary_resume_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_brain_primary_resume_id_fkey";
            columns: ["primary_resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_memory: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          importance: number;
          tags: string[] | null;
          topic: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          importance?: number;
          tags?: string[] | null;
          topic: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          importance?: number;
          tags?: string[] | null;
          topic?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      candidate_profiles: {
        Row: {
          created_at: string;
          current_company: string | null;
          current_title: string | null;
          id: string;
          open_to_work: boolean | null;
          summary: string | null;
          updated_at: string;
          user_id: string;
          years_experience: number | null;
          preferred_roles: string[] | null;
          preferred_locations: string[] | null;
          remote_preference: string | null;
          salary_expectation: number | null;
          github_url: string | null;
          linkedin_url: string | null;
          portfolio_url: string | null;
          career_goal: string | null;
        };
        Insert: {
          created_at?: string;
          current_company?: string | null;
          current_title?: string | null;
          id?: string;
          open_to_work?: boolean | null;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
          years_experience?: number | null;
          preferred_roles?: string[] | null;
          preferred_locations?: string[] | null;
          remote_preference?: string | null;
          salary_expectation?: number | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          career_goal?: string | null;
        };
        Update: {
          created_at?: string;
          current_company?: string | null;
          current_title?: string | null;
          id?: string;
          open_to_work?: boolean | null;
          summary?: string | null;
          updated_at?: string;
          user_id?: string;
          years_experience?: number | null;
          preferred_roles?: string[] | null;
          preferred_locations?: string[] | null;
          remote_preference?: string | null;
          salary_expectation?: number | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          portfolio_url?: string | null;
          career_goal?: string | null;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          created_at: string;
          id: string;
          industry: string | null;
          location: string | null;
          name: string;
          notes: string | null;
          size: string | null;
          user_id: string;
          website: string | null;
          target_value: string | null;
          company_quality_score: number | null;
          hiring_activity_score: number | null;
          strategic_value_score: number | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          industry?: string | null;
          location?: string | null;
          name: string;
          notes?: string | null;
          size?: string | null;
          user_id: string;
          website?: string | null;
          target_value?: string | null;
          company_quality_score?: number | null;
          hiring_activity_score?: number | null;
          strategic_value_score?: number | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          industry?: string | null;
          location?: string | null;
          name?: string;
          notes?: string | null;
          size?: string | null;
          user_id?: string;
          website?: string | null;
          target_value?: string | null;
          company_quality_score?: number | null;
          hiring_activity_score?: number | null;
          strategic_value_score?: number | null;
        };
        Relationships: [];
      };
      company_research: {
        Row: {
          company_id: string | null;
          company_name: string;
          created_at: string;
          culture_notes: string | null;
          file_url: string | null;
          id: string;
          recent_news: string | null;
          source_urls: string[] | null;
          summary: string | null;
          tech_stack: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_id?: string | null;
          company_name: string;
          created_at?: string;
          culture_notes?: string | null;
          file_url?: string | null;
          id?: string;
          recent_news?: string | null;
          source_urls?: string[] | null;
          summary?: string | null;
          tech_stack?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string | null;
          company_name?: string;
          created_at?: string;
          culture_notes?: string | null;
          file_url?: string | null;
          id?: string;
          recent_news?: string | null;
          source_urls?: string[] | null;
          summary?: string | null;
          tech_stack?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_research_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      education: {
        Row: {
          created_at: string;
          degree: string | null;
          description: string | null;
          end_date: string | null;
          field: string | null;
          id: string;
          school: string;
          start_date: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: string;
          school: string;
          start_date?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          degree?: string | null;
          description?: string | null;
          end_date?: string | null;
          field?: string | null;
          id?: string;
          school?: string;
          start_date?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      experiences: {
        Row: {
          company: string;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          is_current: boolean | null;
          location: string | null;
          start_date: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          company: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean | null;
          location?: string | null;
          start_date?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          company?: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean | null;
          location?: string | null;
          start_date?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      followups: {
        Row: {
          application_id: string | null;
          created_at: string;
          done: boolean;
          due_at: string;
          id: string;
          note: string | null;
          recruiter_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          application_id?: string | null;
          created_at?: string;
          done?: boolean;
          due_at: string;
          id?: string;
          note?: string | null;
          recruiter_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          application_id?: string | null;
          created_at?: string;
          done?: boolean;
          due_at?: string;
          id?: string;
          note?: string | null;
          recruiter_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "followups_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "followups_recruiter_id_fkey";
            columns: ["recruiter_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          config: Json;
          created_at: string;
          enabled: boolean | null;
          id: string;
          provider: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          provider: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          enabled?: boolean | null;
          id?: string;
          provider?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      interview_preparation: {
        Row: {
          completed: boolean | null;
          created_at: string;
          id: string;
          interview_id: string | null;
          notes: string | null;
          resources: string[] | null;
          topic: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean | null;
          created_at?: string;
          id?: string;
          interview_id?: string | null;
          notes?: string | null;
          resources?: string[] | null;
          topic: string;
          user_id: string;
        };
        Update: {
          completed?: boolean | null;
          created_at?: string;
          id?: string;
          interview_id?: string | null;
          notes?: string | null;
          resources?: string[] | null;
          topic?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interview_preparation_interview_id_fkey";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ip_interview_fk";
            columns: ["interview_id"];
            isOneToOne: false;
            referencedRelation: "interviews";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          application_id: string | null;
          company_name: string;
          created_at: string;
          id: string;
          interviewer: string | null;
          meeting_url: string | null;
          notes: string | null;
          role_title: string | null;
          round: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["interview_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          application_id?: string | null;
          company_name: string;
          created_at?: string;
          id?: string;
          interviewer?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          role_title?: string | null;
          round?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["interview_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          application_id?: string | null;
          company_name?: string;
          created_at?: string;
          id?: string;
          interviewer?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          role_title?: string | null;
          round?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["interview_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_application_fk";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      job_matches: {
        Row: {
          created_at: string;
          id: string;
          job_id: string | null;
          reasons: string | null;
          recommended_resume_id: string | null;
          score: number;
          skills_matched: string[] | null;
          skills_missing: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id?: string | null;
          reasons?: string | null;
          recommended_resume_id?: string | null;
          score?: number;
          skills_matched?: string[] | null;
          skills_missing?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string | null;
          reasons?: string | null;
          recommended_resume_id?: string | null;
          score?: number;
          skills_matched?: string[] | null;
          skills_missing?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_matches_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_matches_recommended_resume_id_fkey";
            columns: ["recommended_resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      job_preferences: {
        Row: {
          countries: string[] | null;
          created_at: string;
          currency: string | null;
          employment_types: Database["public"]["Enums"]["employment_type"][] | null;
          id: string;
          max_salary: number | null;
          min_salary: number | null;
          preferred_roles: string[] | null;
          remote_preference: Database["public"]["Enums"]["remote_pref"] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          countries?: string[] | null;
          created_at?: string;
          currency?: string | null;
          employment_types?: Database["public"]["Enums"]["employment_type"][] | null;
          id?: string;
          max_salary?: number | null;
          min_salary?: number | null;
          preferred_roles?: string[] | null;
          remote_preference?: Database["public"]["Enums"]["remote_pref"] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          countries?: string[] | null;
          created_at?: string;
          currency?: string | null;
          employment_types?: Database["public"]["Enums"]["employment_type"][] | null;
          id?: string;
          max_salary?: number | null;
          min_salary?: number | null;
          preferred_roles?: string[] | null;
          remote_preference?: Database["public"]["Enums"]["remote_pref"] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          company_size: string | null;
          company_id: string | null;
          company_name: string | null;
          created_at: string;
          description: string | null;
          easy_apply: boolean | null;
          experience_level: string | null;
          external_id: string | null;
          freshness_bucket: string | null;
          id: string;
          location: string | null;
          match_score: number | null;
          normalized_roles: string[] | null;
          posted_at: string | null;
          priority: Database["public"]["Enums"]["job_priority"];
          raw_payload: Json;
          salary_range: string | null;
          salary_max: number | null;
          salary_min: number | null;
          saved: boolean | null;
          source: string | null;
          source_type: string | null;
          status: Database["public"]["Enums"]["job_status"];
          title: string;
          updated_at: string;
          url: string | null;
          user_id: string;
          work_mode: string | null;
        };
        Insert: {
          company_size?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          easy_apply?: boolean | null;
          experience_level?: string | null;
          external_id?: string | null;
          freshness_bucket?: string | null;
          id?: string;
          location?: string | null;
          match_score?: number | null;
          normalized_roles?: string[] | null;
          posted_at?: string | null;
          priority?: Database["public"]["Enums"]["job_priority"];
          raw_payload?: Json;
          salary_range?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          saved?: boolean | null;
          source?: string | null;
          source_type?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title: string;
          updated_at?: string;
          url?: string | null;
          user_id: string;
          work_mode?: string | null;
        };
        Update: {
          company_size?: string | null;
          company_id?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          easy_apply?: boolean | null;
          experience_level?: string | null;
          external_id?: string | null;
          freshness_bucket?: string | null;
          id?: string;
          location?: string | null;
          match_score?: number | null;
          normalized_roles?: string[] | null;
          posted_at?: string | null;
          priority?: Database["public"]["Enums"]["job_priority"];
          raw_payload?: Json;
          salary_range?: string | null;
          salary_max?: number | null;
          salary_min?: number | null;
          saved?: boolean | null;
          source?: string | null;
          source_type?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          title?: string;
          updated_at?: string;
          url?: string | null;
          user_id?: string;
          work_mode?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_company_fk";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_loop: {
        Row: {
          action: string | null;
          applied: boolean;
          created_at: string;
          id: string;
          insight: string;
          source: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action?: string | null;
          applied?: boolean;
          created_at?: string;
          id?: string;
          insight: string;
          source: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action?: string | null;
          applied?: boolean;
          created_at?: string;
          id?: string;
          insight?: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read: boolean | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      outreach_campaigns: {
        Row: {
          active: boolean | null;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          template: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          template?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          template?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      outreach_messages: {
        Row: {
          body: string | null;
          campaign_id: string | null;
          created_at: string;
          id: string;
          recruiter_id: string | null;
          replied_at: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["outreach_status"];
          subject: string | null;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          id?: string;
          recruiter_id?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["outreach_status"];
          subject?: string | null;
          user_id: string;
        };
        Update: {
          body?: string | null;
          campaign_id?: string | null;
          created_at?: string;
          id?: string;
          recruiter_id?: string | null;
          replied_at?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["outreach_status"];
          subject?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "om_campaign_fk";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "outreach_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "om_recruiter_fk";
            columns: ["recruiter_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_messages_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "outreach_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_messages_recruiter_id_fkey";
            columns: ["recruiter_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
        ];
      };
      painpoints: {
        Row: {
          company_id: string | null;
          company_name: string | null;
          created_at: string;
          description: string | null;
          id: string;
          severity: number;
          source_url: string | null;
          tags: string[] | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_id?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          severity?: number;
          source_url?: string | null;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string | null;
          company_name?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          severity?: number;
          source_url?: string | null;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "painpoints_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          email: string | null;
          github_url: string | null;
          headline: string | null;
          id: string;
          linkedin_url: string | null;
          location: string | null;
          name: string | null;
          phone: string | null;
          portfolio_url: string | null;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          github_url?: string | null;
          headline?: string | null;
          id: string;
          linkedin_url?: string | null;
          location?: string | null;
          name?: string | null;
          phone?: string | null;
          portfolio_url?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          email?: string | null;
          github_url?: string | null;
          headline?: string | null;
          id?: string;
          linkedin_url?: string | null;
          location?: string | null;
          name?: string | null;
          phone?: string | null;
          portfolio_url?: string | null;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          created_at: string;
          description: string | null;
          features: string[] | null;
          github_url: string | null;
          id: string;
          impact: string | null;
          live_url: string | null;
          name: string;
          tech_stack: string[] | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          features?: string[] | null;
          github_url?: string | null;
          id?: string;
          impact?: string | null;
          live_url?: string | null;
          name: string;
          tech_stack?: string[] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          features?: string[] | null;
          github_url?: string | null;
          id?: string;
          impact?: string | null;
          live_url?: string | null;
          name?: string;
          tech_stack?: string[] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      recruiter_conversations: {
        Row: {
          channel: string | null;
          created_at: string;
          id: string;
          last_message_at: string | null;
          recruiter_id: string | null;
          subject: string | null;
          summary: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          recruiter_id?: string | null;
          subject?: string | null;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel?: string | null;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          recruiter_id?: string | null;
          subject?: string | null;
          summary?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recruiter_conversations_recruiter_id_fkey";
            columns: ["recruiter_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
        ];
      };
      recruiters: {
        Row: {
          company: string | null;
          created_at: string;
          email: string | null;
          id: string;
          last_contacted_at: string | null;
          linkedin_url: string | null;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          last_contacted_at?: string | null;
          linkedin_url?: string | null;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          last_contacted_at?: string | null;
          linkedin_url?: string | null;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      resume_versions: {
        Row: {
          content: string | null;
          created_at: string;
          file_url: string | null;
          id: string;
          notes: string | null;
          resume_id: string;
          user_id: string;
          version: number;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          resume_id: string;
          user_id: string;
          version?: number;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          resume_id?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resume_versions_resume_id_fkey";
            columns: ["resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rv_resume_fk";
            columns: ["resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      resumes: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_primary: boolean | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_primary?: boolean | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_primary?: boolean | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          created_at: string;
          email_notifications: boolean | null;
          id: string;
          theme: string | null;
          timezone: string | null;
          updated_at: string;
          user_id: string;
          weekly_digest: boolean | null;
        };
        Insert: {
          created_at?: string;
          email_notifications?: boolean | null;
          id?: string;
          theme?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id: string;
          weekly_digest?: boolean | null;
        };
        Update: {
          created_at?: string;
          email_notifications?: boolean | null;
          id?: string;
          theme?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id?: string;
          weekly_digest?: boolean | null;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          category: string | null;
          created_at: string;
          id: string;
          level: Database["public"]["Enums"]["skill_level"];
          name: string;
          user_id: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["skill_level"];
          name: string;
          user_id: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["skill_level"];
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tailored_resumes: {
        Row: {
          id: string;
          user_id: string;
          resume_id: string;
          resume_version_id: string | null;
          job_id: string | null;
          job_description: string;
          optimized_resume: string;
          ats_friendly_resume: string;
          missing_skills: string[] | null;
          storage_path: string | null;
          created_at: string;
          updated_at: string;
          pdf_storage_path: string | null;
          pdf_file_size: number | null;
          pdf_page_count: number | null;
          pdf_verified: boolean | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          resume_id: string;
          resume_version_id?: string | null;
          job_id?: string | null;
          job_description: string;
          optimized_resume: string;
          ats_friendly_resume: string;
          missing_skills?: string[] | null;
          storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
          pdf_storage_path?: string | null;
          pdf_file_size?: number | null;
          pdf_page_count?: number | null;
          pdf_verified?: boolean | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          resume_id?: string;
          resume_version_id?: string | null;
          job_id?: string | null;
          job_description?: string;
          optimized_resume?: string;
          ats_friendly_resume?: string;
          missing_skills?: string[] | null;
          storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
          pdf_storage_path?: string | null;
          pdf_file_size?: number | null;
          pdf_page_count?: number | null;
          pdf_verified?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "tailored_resumes_resume_id_fkey";
            columns: ["resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tailored_resumes_resume_version_id_fkey";
            columns: ["resume_version_id"];
            isOneToOne: false;
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tailored_resumes_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_notifications: {
        Row: {
          chat_id: string | null;
          created_at: string;
          error: string | null;
          id: string;
          message: string;
          sent_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          chat_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          message: string;
          sent_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          chat_id?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          message?: string;
          sent_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "user";
      application_status:
        | "saved"
        | "applied"
        | "screening"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
        | "accepted";
      employment_type: "full_time" | "part_time" | "contract" | "internship" | "freelance";
      interview_status: "scheduled" | "completed" | "cancelled" | "rescheduled";
      job_priority: "low" | "medium" | "high";
      job_status: "open" | "closed" | "saved" | "archived";
      outreach_status: "draft" | "sent" | "replied" | "no_response" | "bounced";
      remote_pref: "remote" | "hybrid" | "onsite" | "any";
      skill_level: "beginner" | "intermediate" | "advanced" | "expert";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      application_status: [
        "saved",
        "applied",
        "screening",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
        "accepted",
      ],
      employment_type: ["full_time", "part_time", "contract", "internship", "freelance"],
      interview_status: ["scheduled", "completed", "cancelled", "rescheduled"],
      job_priority: ["low", "medium", "high"],
      job_status: ["open", "closed", "saved", "archived"],
      outreach_status: ["draft", "sent", "replied", "no_response", "bounced"],
      remote_pref: ["remote", "hybrid", "onsite", "any"],
      skill_level: ["beginner", "intermediate", "advanced", "expert"],
    },
  },
} as const;
