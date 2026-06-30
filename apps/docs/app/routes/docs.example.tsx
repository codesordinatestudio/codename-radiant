import { DocTemplate } from "../components/blocks/DocTemplate";
import { CodeBlock } from "../components/ui/CodeBlock";
import { Callout } from "../components/ui/Callout";

export default function DocsExamplePage() {
  const sampleCode = `function calculateCircleArea(radius) {
  // The code that calculate the area over a the given radius.
  return radius * radius * Math.PI;
}

if (calculateCircleArea(5) > 50) {
  return circleArea * 5;
}

// The code includes comments and input handling.
console.log("Circle Area:", result);`;

  return (
    <DocTemplate
      title="Installation"
      description="Learn how to install and set up MaterialMe in your project."
      prevPage={{ label: "Intro", href: "#" }}
      nextPage={{ label: "Quickstart", href: "#" }}
    >
      <section>
        <CodeBlock 
          code={sampleCode}
          tabs={["Live example", "Figma Design", "Code"]}
          activeTab="Code"
        />
        
        <p className="text-gray-600 mt-6 leading-relaxed">
          This code defines a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm text-gray-800">calculateCircleArea</code> function that calculates the area of a circle based on the given radius. It then uses this function to calculate the area of a circle with a radius of 5 and prints the result to the console. The code includes comments and input error handling to ensure robust execution.
        </p>

        <Callout title="Tip" icon={<span className="text-teal-600">💡</span>}>
          You can use <a href="#" className="underline font-medium hover:text-gray-900">Sandpack</a> to develop code preview like this ✌️.
        </Callout>
      </section>
    </DocTemplate>
  );
}
