if (functionCall.name === "tag-all") {
            // tagAll handles its own messaging
            await this.f.tagAll();
            return { reply: null, functionHandled: true };
          } else if (functionCall.name === "unlock-view-once") {
            await this.f.unlockViewOnce();
            return { reply: null, functionHandled: true };
          } else if (functionCall.name === "start-wcg") {
            await this.f.startWCG();
            return { reply: null, functionHandled: true };
          } else if (functionCall.name === "end-wcg") {
            await this.f.endWCG();
            return { reply: null, functionHandled: true };
          } else if (functionCall.name === "wcg-status") {
            await this.f.getWCGStatus();
            return { reply: null, functionHandled: true };
          } else if (functionCall.name === "unlock-view-once-to-dm") {
            await this.f.unlockViewOnceToDM();
            return { reply: null, functionHandled: true };
          }