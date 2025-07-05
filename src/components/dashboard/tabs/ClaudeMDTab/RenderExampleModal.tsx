import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Copy, FileText, Book } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { addToast } from "@heroui/toast";

export const EXAMPLE_CLAUDE_CONTENT = `# Research Mode Instructions
- NEVER modify, create, or delete any files
- Only analyze and explain existing code
- **WORKSPACE SCOPE: Only analyze files within the specific workspace directory you were directed to work in**
- Do not access or reference files outside the designated workspace
- Provide detailed explanations of code structure and functionality within the workspace
- Answer questions about architecture and implementation within the workspace scope
- Generate documentation and analysis reports only for the workspace content
- If asked to make changes, politely decline and offer analysis instead


# Dev-Test Mode Instructions
- You are authorized to make code changes
- **WORKSPACE SCOPE: Only make changes within the specific workspace directory you were directed to work in**
- Do not modify, create, or delete files outside the designated workspace
- Always run tests after making changes (within workspace scope)
- Automatically commit successful changes with descriptive messages
- If tests fail, analyze and fix issues before committing
- Follow TDD practices: write tests first when adding features
- **IMPORTANT: DO NOT PERFORM ANY GIT OPERATIONS (COMMIT, ADD, PUSH, etc.)**`;

interface RenderExampleModalProps {
  isExampleModalOpen: boolean;
  setIsExampleModalOpen: (isOpen: boolean) => void;
  saveClaudeContent: () => void;
  setContent: (content: string) => void;
}

export default function RenderExampleModal({ isExampleModalOpen, setIsExampleModalOpen, saveClaudeContent, setContent }: RenderExampleModalProps) {
    const useExampleContent = async () => {
        setContent(EXAMPLE_CLAUDE_CONTENT);
        await saveClaudeContent();
        setIsExampleModalOpen(false);
    };
    
    const copyExampleToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(EXAMPLE_CLAUDE_CONTENT);
            addToast({
            title: "Success",
            description: "Example content copied to clipboard",
            color: "success"
            });
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            addToast({
            title: "Error",
            description: "Failed to copy to clipboard",
            color: "danger"
            });
        }
    };
    
    return (
      <Modal 
        isOpen={isExampleModalOpen} 
        onOpenChange={setIsExampleModalOpen}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Book className="w-5 h-5 text-primary" />
              <h2>Example CLAUDE.md Configuration</h2>
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This is an example configuration that demonstrates how to structure your CLAUDE.md file 
                to guide Claude AI&#39;s behavior in your workspace.
              </p>
              
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                <div className="prose prose-sm max-w-full dark:prose-invert">
                  <ReactMarkdown>{EXAMPLE_CLAUDE_CONTENT}</ReactMarkdown>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              color="default" 
              variant="light" 
              onPress={() => setIsExampleModalOpen(false)}
            >
              Close
            </Button>
            <Button 
              color="secondary" 
              variant="flat"
              startContent={<Copy className="w-4 h-4" />}
              onPress={copyExampleToClipboard}
            >
              Copy to Clipboard
            </Button>
            <Button 
              color="primary" 
              startContent={<FileText className="w-4 h-4" />}
              onPress={async () => await useExampleContent()}
            >
              Use This Example
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
}