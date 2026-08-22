import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

class BasicBlock(nn.Module):
    """Bloc résiduel basique pour le ResNet léger."""
    def __init__(self, in_c, out_c, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_c, out_c, 3, stride, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_c)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(out_c, out_c, 3, 1, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_c)
        
        self.downsample = nn.Sequential()
        if stride != 1 or in_c != out_c:
            self.downsample = nn.Sequential(
                nn.Conv2d(in_c, out_c, 1, stride, bias=False),
                nn.BatchNorm2d(out_c)
            )

    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.downsample(x)
        return self.relu(out)

class OracleCNN(nn.Module):
    """Réseau de neurones convolutif Oracle Zêta-2."""
    def __init__(self, num_filters=16):
        super().__init__()
        self.layer1 = nn.Sequential(
            nn.Conv2d(1, num_filters, 3, 1, 1, bias=False),
            nn.BatchNorm2d(num_filters),
            nn.ReLU(inplace=True)
        )
        self.layer2 = BasicBlock(num_filters, num_filters*2, stride=2)
        self.layer3 = BasicBlock(num_filters*2, num_filters*2, stride=2)
        
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(num_filters*2, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        x = self.fc(x)
        return self.sigmoid(x)

def load_zeta1_dataset(size=1000):
    """Génère un dataset synthétique simulant les matrices 20x20 de Zêta-1."""
    # Matrice de taille 20x20
    X = torch.rand(size, 1, 20, 20)
    # Règle arbitraire : somme > 200 => proba proche de 1
    targets = (X.sum(dim=(1, 2, 3)) > 200).float().unsqueeze(1)
    return TensorDataset(X, targets)

def train_oracle(model, dataloader, epochs):
    """Entraîne l'OracleCNN sur le dataset."""
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.01)
    
    final_loss, final_acc = 0.0, 0.0
    for epoch in range(epochs):
        model.train()
        total_loss, correct, total = 0.0, 0, 0
        
        for inputs, targets in dataloader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            predicted = (outputs >= 0.5).float()
            correct += (predicted == targets).sum().item()
            total += targets.size(0)
            
        final_loss = total_loss / len(dataloader)
        final_acc = correct / total
        print(f"Epoch {epoch+1}/{epochs} - Loss: {final_loss:.4f} - Accuracy: {final_acc:.4f}")
        
    return final_loss, final_acc

if __name__ == "__main__":
    print("Initialisation de Zêta-2 (Oracle CNN)...")
    dataset = load_zeta1_dataset(1000)
    dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
    
    model = OracleCNN(16)
    
    print("Début de l'entraînement sur le dataset de Zêta-1...")
    loss, acc = train_oracle(model, dataloader, epochs=15)
    
    print("\n[Rapport Zêta-2]")
    print(f"Loss Finale: {loss:.4f}")
    print(f"Précision Finale: {acc*100:.2f}%")
