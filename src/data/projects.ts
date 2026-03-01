export interface Project {
  title: string;
  description: string;
  tags: string[];
  url?: string;
  github?: string;
  featured: boolean;
}

export const projects: Project[] = [
  {
    title: "linhanning.com",
    description:
      "My personal blog and portfolio built with Astro, Tailwind CSS, and deployed on GitHub Pages.",
    tags: ["Astro", "Tailwind CSS", "TypeScript"],
    github: "https://github.com/hanninglin/linhanning.com",
    url: "https://linhanning.com",
    featured: true,
  },
  {
    title: "Project Two",
    description:
      "A sample project placeholder. Replace this with a real project description.",
    tags: ["React", "Node.js", "PostgreSQL"],
    github: "https://github.com/hanninglin",
    featured: true,
  },
  {
    title: "Project Three",
    description:
      "Another sample project placeholder. Replace this with a real project description.",
    tags: ["Python", "FastAPI", "Docker"],
    github: "https://github.com/hanninglin",
    featured: false,
  },
];
